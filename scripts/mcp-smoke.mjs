import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
const researchID = process.argv[2];
if (researchID && !/^[a-zA-Z0-9._-]+$/.test(researchID)) throw new Error('Pass one exact safe research reference.');
const [agentID, agentVersion] = process.argv.slice(3);
const proposalFile = process.argv[5];
if ((agentID || agentVersion) && (!agentID || !agentVersion || ![agentID, agentVersion].every(v => /^[a-zA-Z0-9._-]{1,128}$/.test(v)))) {
  throw new Error('Optional agent check requires an exact safe ID and version.');
}
const child = spawn(root + 'target/debug/researcher-codex', ['mcp'], {
  cwd: root, env: {...process.env, Q2_MCP_DEBUG: '1'}, stdio: ['pipe', 'pipe', 'pipe'],
});
child.stderr.resume(); // MCP debug metadata is separate from the JSON-RPC channel.
const lines = createInterface({input: child.stdout});
const pending = new Map();
let nextID = 0;
lines.on('line', line => {
  let message;
  try { message = JSON.parse(line); } catch { throw new Error('MCP wrote non-JSON content to stdout.'); }
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id); clearTimeout(request.timer);
  if (message.error) request.reject(new Error('MCP protocol error: ' + message.error.message));
  else request.resolve(message.result);
});
child.on('error', error => { for (const item of pending.values()) item.reject(error); });
function request(method, params) {
  const id = ++nextID;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(method + ' timed out.')); }, 15000);
    pending.set(id, {resolve, reject, timer});
    child.stdin.write(JSON.stringify({jsonrpc: '2.0', id, method, params}) + '\n');
  });
}
try {
  const init = await request('initialize', {protocolVersion: '2025-11-25', capabilities: {},
    clientInfo: {name: 'the-semantic-read-smoke', version: '0.1.0'}});
  assert.ok(init.capabilities.tools);
  child.stdin.write(JSON.stringify({jsonrpc: '2.0', method: 'notifications/initialized'}) + '\n');
  const tools = await request('tools/list', {});
  assert.deepEqual(tools.tools.map(t => t.name).sort(),
    ['agent_get', 'agent_list', 'proposal_get', 'proposal_list', 'proposal_prepare', 'proposal_save', 'research_get', 'research_list', 'research_run']);
  for (const name of ['research_list', 'agent_list', 'proposal_list']) {
    const result = await request('tools/call', {name, arguments: {}});
    if (result.isError) throw new Error('MCP catalog read failed.');
  }
  if (researchID) {
    const result = await request('tools/call', {name: 'research_get', arguments: {research_id: researchID}});
    if (result.isError) throw new Error('MCP research read failed.');
    const record = JSON.parse(result.content.find(c => c.type === 'text').text);
    const response = await fetch('http://127.0.0.1:5056/api/research/v1/research/' + researchID);
    if (response.status !== 200 || !isDeepStrictEqual(record, await response.json())) {
      throw new Error('MCP research read does not match the API.');
    }
  }
  if (agentID) {
    const result = await request('tools/call', {name: 'agent_get', arguments: {id: agentID, version: agentVersion}});
    assert.notEqual(result.isError, true);
    const agent = JSON.parse(result.content.find(c => c.type === 'text').text);
    const response = await fetch(`http://127.0.0.1:5056/api/research/v1/agents/${agentID}?version=${agentVersion}`);
    assert.equal(response.status, 200);
    assert.ok(isDeepStrictEqual(agent, await response.json()), 'Agent API parity failed.');
    const catalog = await request('tools/call', {name: 'agent_list', arguments: {}});
    assert.notEqual(catalog.isError, true);
    assert.ok(JSON.parse(catalog.content.find(c => c.type === 'text').text).agents.some(a => a.id === agentID && a.version === agentVersion && a.definition_digest === agent.definition_digest));
  }
  let proposalID;
  if (proposalFile) {
    const spec = JSON.parse(await readFile(proposalFile, 'utf8'));
    const saved = await request('tools/call', {name: 'proposal_save', arguments: spec});
    assert.notEqual(saved.isError, true);
    const proposal = JSON.parse(saved.content.find(c => c.type === 'text').text);
    assert.equal(proposal.status, 'DRAFT'); proposalID = proposal.proposal_id;
    const read = await request('tools/call', {name: 'proposal_get', arguments: {proposal_id: proposalID}});
    assert.notEqual(read.isError, true);
    assert.ok(isDeepStrictEqual(JSON.parse(read.content.find(c => c.type === 'text').text), proposal), 'Proposal MCP parity failed.');
    const response = await fetch(`http://127.0.0.1:5056/api/research/v1/proposals/${proposalID}`);
    assert.equal(response.status, 200); assert.ok(isDeepStrictEqual(await response.json(), proposal), 'Proposal API parity failed.');
    const catalog = await request('tools/call', {name: 'proposal_list', arguments: {order: 'newest'}});
    assert.notEqual(catalog.isError, true);
    assert.ok(JSON.parse(catalog.content.find(c => c.type === 'text').text).proposals.some(p => p.proposal_id === proposalID));
  }
  console.log('MCP initialization, tool discovery, and requested catalog checks passed.');
} finally {
  for (const item of pending.values()) clearTimeout(item.timer);
  child.stdin.end(); lines.close(); child.kill();
}
