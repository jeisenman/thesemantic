import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { readConnections } from '../src/connections-host.js';
import { endpointOrigin, ConnectionListSchema } from '../src/connection-contracts.js';
import { ReadSchema, validateResponse } from '../src/api.js';
import { mountConnections } from '../src/connections-view.js';

const settle = () => new Promise(resolve => setImmediate(resolve));
const health = async () => new Response(JSON.stringify({status:'ok',tracking_uri:'http://localhost:5055/private-token?credential=secret#secret',experiment_id:'private',experiment_name:'private',project_root:'/private/path'}));
test('host reads finite health and metadata only, and strips private settings', async () => {
  const root = await mkdtemp(join(tmpdir(), 'semantic-connections-'));
  try {
    const file = join(root,'graph.json'); await writeFile(file,'not a validated graph');
    const calls: string[] = [];
    const inventory = await readConnections({operation:'connections.list'},{lineageSnapshot:file,zendeskSnapshot:root},async (url,init) => {
      calls.push(url); assert.equal(init?.redirect,'error'); assert.equal(init?.credentials,'omit'); assert.ok(init?.signal); return health();
    });
    assert.deepEqual(calls,['http://127.0.0.1:5056/health']);
    assert.equal(inventory.connections.find(c=>c.id==='mlflow')?.endpoint,'http://localhost:5055');
    assert.equal(inventory.connections.find(c=>c.id==='lineage')?.status,'configured');
    assert.equal(inventory.connections.find(c=>c.id==='zendesk')?.detail,'directory-present');
    assert.doesNotMatch(JSON.stringify(inventory),/secret|private|graph.json/);
    assert.deepEqual(validateResponse('connections.list',inventory),inventory);
  } finally { await rm(root,{recursive:true,force:true}); }
});
test('failures remain explicit and configured export errors cannot fall back', async () => {
  const result = await readConnections({operation:'connections.list'}, {lineageSnapshot:'/missing/snapshot',lineageURL:'http://127.0.0.1:7420'}, async () => {throw new Error('private error');});
  assert.equal(result.connections.find(c=>c.id==='api')?.status,'unavailable');
  assert.equal(result.connections.find(c=>c.id==='mlflow')?.endpoint,undefined);
  assert.equal(result.connections.find(c=>c.id==='lineage')?.detail,'file-unavailable');
  assert.equal(result.connections.find(c=>c.id==='zendesk')?.status,'not-configured');
  const invalid = await readConnections({operation:'connections.list'}, {lineageURL:'http://user:secret@localhost:7420/path'}, health);
  assert.equal(invalid.connections.find(c=>c.id==='lineage')?.detail,'invalid-origin');
  assert.doesNotMatch(JSON.stringify(invalid),/secret|user:/);
});
test('boundary rejects URL, paths, commands, credentials, duplicate services and private response fields', async () => {
  for (const extra of [{url:'https://example.com'},{path:'/tmp/private'},{command:'shell'}]) {
    const raw = {operation:'connections.list',...extra}; assert.equal(ReadSchema.safeParse(raw).success,false);
    await assert.rejects(readConnections(raw,{},async()=>{throw new Error('must not fetch');}));
  }
  assert.equal(endpointOrigin('https://user:secret@example.com'),undefined);
  assert.equal(endpointOrigin('file:///private'),undefined);
  assert.equal(endpointOrigin('https://example.com/secret?secret#secret'),'https://example.com');
  const data = await readConnections({operation:'connections.list'},{},health);
  const first = data.connections[0]!;
  assert.equal(ConnectionListSchema.safeParse({...data,connections:data.connections.map(()=>first)}).success,false);
  assert.equal(ConnectionListSchema.safeParse({...data,secret:'private'}).success,false);
  assert.equal(ConnectionListSchema.safeParse({...data,connections:[{...first,endpoint:'http://localhost/private'},...data.connections.slice(1)]}).success,false);
});
test('both pages show finite inventory, filtering, manual refresh and safe errors', async () => {
  const data = await readConnections({operation:'connections.list'},{},health);
  for (const mode of ['Connections','Integrations'] as const) {
    const dom = new JSDOM('<main></main>'); Object.assign(globalThis,{document:dom.window.document});
    const host = document.querySelector('main')!; let calls=0;
    const stop = mountConnections(host,mode,async request=>{assert.deepEqual(request,{operation:'connections.list'});if(++calls>1)throw new Error('private-password');return data;});
    await settle(); assert.equal(host.querySelectorAll('.connection-card').length,7); assert.match(host.textContent!,/Last refreshed/);
    assert.match(host.textContent!,/Configured · not verified/); assert.equal(calls,1);
    if(mode==='Integrations')assert.match(host.textContent!,/Standard input \/ output · no URL/);
    const input=host.querySelector('input')!;input.value='MLflow';input.dispatchEvent(new dom.window.Event('input'));assert.equal(host.querySelectorAll('.connection-card').length,1);
    (host.querySelector('.refresh') as HTMLButtonElement).click();await settle();assert.equal(calls,2);assert.match(host.textContent!,/refresh failed/);assert.doesNotMatch(host.textContent!,/private-password/);assert.equal(host.querySelectorAll('.connection-card').length,1);
    stop();assert.equal(host.children.length,0);dom.window.close();
  }
});
test('disposal prevents late reads and detached refresh actions from changing the view', async () => {
  const dom=new JSDOM('<main></main>');Object.assign(globalThis,{document:dom.window.document});const host=document.querySelector('main')!;
  let resolve:(value:unknown)=>void=()=>{};let calls=0;
  const stop=mountConnections(host,'Connections',()=>{calls++;return new Promise(done=>{resolve=done;});});
  const refresh=host.querySelector('button')!;stop();host.textContent='Existing Research';
  resolve(await readConnections({operation:'connections.list'},{},health));await settle();refresh.click();assert.equal(calls,1);assert.equal(host.textContent,'Existing Research');dom.window.close();
});
