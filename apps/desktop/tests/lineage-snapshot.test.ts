import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, open, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readConfiguredLineage } from '../src/lineage-snapshot.js';
import { ExplanationSchema, LineageGraphSchema } from '../src/lineage-contracts.js';

const node = { id: { namespace: 'fixture://local/a', name: 'Input / # %' }, dataset: {}, facets: { meaning: {} } };
const graph = { nodes: [node], edges: [], aliases: [], unresolved: ['Fixture only.'] };
const request = { operation: 'lineage.graph' } as const;
async function fixture(run: (path: string, root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'semantic-lineage-'));
  try {
    const path = join(root, 'graph.json');
    await writeFile(path, JSON.stringify(graph));
    await run(path, root);
  } finally { await rm(root, { recursive: true, force: true }); }
}

test('configured export returns the strict graph and exact node with explicit static limitations', async () => {
  await fixture(async snapshot => {
    const result = LineageGraphSchema.parse(await readConfiguredLineage(request, { snapshot }));
    assert.deepEqual(result.nodes, [node]);
    assert.ok(result.unresolved.includes('Fixture only.'));
    assert.match(result.unresolved.join(' '), /source freshness, definition staleness.*not been verified/);
    const explanation = ExplanationSchema.parse(await readConfiguredLineage({ operation: 'lineage.node', id: node.id }, { snapshot }));
    assert.deepEqual(explanation.node, node);
    assert.equal(explanation.definitions_status, 'disabled');
    assert.deepEqual(explanation.definitions, []);
    assert.equal(explanation.job_flow, undefined);
    assert.deepEqual(explanation.node.facets.meaning, {});
    await assert.rejects(readConfiguredLineage({ operation: 'lineage.node', id: { ...node.id, column: 'missing' } }, { snapshot }), /absent from.*export/);
    await assert.rejects(readConfiguredLineage({ operation: 'lineage.node', id: { ...node.id, name: ` ${node.id.name}` } }, { snapshot }));
    await assert.rejects(readConfiguredLineage({ operation: 'lineage.node', id: { ...node.id, name: 'a'.repeat(4096), namespace: 'b'.repeat(4096) } }, { snapshot }), /wire limit/);
  });
});

test('invalid configured exports fail safely without an HTTP fallback', async () => {
  await fixture(async (snapshot, root) => {
    let calls = 0;
    const fetcher = async () => { calls++; return new Response(JSON.stringify(graph)); };
    for (const path of ['', 'relative.json', join(root, 'missing.json'), root]) {
      await assert.rejects(readConfiguredLineage(request, { snapshot: path }, fetcher), /SEMANTIC_LINEAGE_SNAPSHOT/);
    }
    const link = join(root, 'link.json');
    await symlink(snapshot, link);
    await assert.rejects(readConfiguredLineage(request, { snapshot: link }, fetcher), /regular JSON file/);
    for (const content of ['{', '\u00ff', JSON.stringify({ ...graph, nodes: [node, node] }), JSON.stringify({ ...graph, unexpected: true }), JSON.stringify({ ...graph, edges: [{ source: node.id, target: { ...node.id, name: 'absent' }, kind: 'fixture' }] })]) {
      await writeFile(snapshot, content);
      await assert.rejects(readConfiguredLineage(request, { snapshot }, fetcher), /SEMANTIC_LINEAGE_SNAPSHOT/);
    }
    await writeFile(snapshot, Buffer.from([0xff]));
    await assert.rejects(readConfiguredLineage(request, { snapshot }, fetcher), /SEMANTIC_LINEAGE_SNAPSHOT/);
    const file = await open(snapshot, 'w');
    try { await file.truncate(32_000_001); } finally { await file.close(); }
    await assert.rejects(readConfiguredLineage(request, { snapshot }, fetcher), /32 MB/);
    assert.equal(calls, 0);
  });
});

test('unset snapshot uses the existing validated HTTP path and origin', async () => {
  const paths: string[] = [];
  const fetcher = async (input: string | URL | Request) => {
    paths.push(String(input));
    return new Response(JSON.stringify(graph));
  };
  assert.deepEqual(await readConfiguredLineage(request, {}, fetcher), graph);
  assert.deepEqual(paths, ['http://127.0.0.1:7420/graph']);
  await readConfiguredLineage(request, { origin: 'http://localhost:7777' }, fetcher);
  assert.equal(paths.at(-1), 'http://localhost:7777/graph');
  await assert.rejects(readConfiguredLineage(request, { origin: 'https://example.com' }, fetcher), /loopback origin/);
});
