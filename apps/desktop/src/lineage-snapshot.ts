import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { z } from 'zod';
import { ExplanationSchema, LineageGraphSchema, NodeIDSchema, nodeKey, nodePath } from './lineage-contracts.js';
import { lineageOrigin, readLineage } from './lineage-client.js';
import type { ReadFetch } from './bounded-json.js';

const maximumBytes = 32_000_000;
const RequestSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('lineage.graph') }).strict(),
  z.object({ operation: z.literal('lineage.node'), id: NodeIDSchema }).strict(),
]);
type Request = z.infer<typeof RequestSchema>;
const snapshotLimits = 'Static export: source freshness, definition staleness, and complete lineage coverage have not been verified.';

/** Trusted host settings; paths and origins must never come from renderer input. */
export interface LineageSettings {
  snapshot?: string;
  origin?: string;
}

async function readSnapshot(path: string): Promise<unknown> {
  if (!isAbsolute(path)) throw new Error('SEMANTIC_LINEAGE_SNAPSHOT must name an absolute JSON file path.');
  try {
    const before = await lstat(path);
    if (!before.isFile()) throw new Error('not a regular file');
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.dev !== before.dev || stat.ino !== before.ino) throw new Error('file changed');
      if (stat.size > maximumBytes) throw new Error('size limit');
      const chunks: Buffer[] = [];
      let length = 0;
      while (length <= maximumBytes) {
        const chunk = Buffer.alloc(Math.min(64_000, maximumBytes + 1 - length));
        const { bytesRead } = await file.read(chunk, 0, chunk.length, null);
        if (!bytesRead) break;
        chunks.push(chunk.subarray(0, bytesRead));
        length += bytesRead;
      }
      if (length > maximumBytes) throw new Error('size limit');
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, length)));
    } finally { await file.close(); }
  } catch {
    throw new Error('Cannot read SEMANTIC_LINEAGE_SNAPSHOT. Select an accessible regular JSON file, without a file symlink, no larger than 32 MB.');
  }
}

/** Reads the configured static export, or the original HTTP source when no export is configured. */
export async function readConfiguredLineage(
  raw: Request,
  settings: LineageSettings = { snapshot: process.env.SEMANTIC_LINEAGE_SNAPSHOT, origin: process.env.SEMANTIC_LINEAGE_URL },
  fetcher?: ReadFetch,
): Promise<unknown> {
  const request = RequestSchema.parse(raw);
  if (request.operation === 'lineage.node') nodePath(request.id);
  if (settings.snapshot === undefined) return readLineage(request, lineageOrigin(settings.origin), fetcher);
  const parsed = LineageGraphSchema.safeParse(await readSnapshot(settings.snapshot));
  if (!parsed.success) throw new Error('Invalid SEMANTIC_LINEAGE_SNAPSHOT graph. Use the documented typed export format with unique nodes and matching edge identities.');
  const graph = { ...parsed.data, unresolved: [...new Set([...parsed.data.unresolved, snapshotLimits])] };
  if (request.operation === 'lineage.graph') return graph;
  const node = graph.nodes.find(item => nodeKey(item.id) === nodeKey(request.id));
  if (!node) throw new Error('The requested node is absent from the configured lineage export. Refresh the export or select a listed node.');
  return ExplanationSchema.parse({ node, definitions: [], definitions_status: 'disabled', unresolved: graph.unresolved });
}
