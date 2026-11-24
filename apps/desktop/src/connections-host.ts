import { lstat, stat } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { boundedJSON, type ReadFetch } from './bounded-json.js';
import { lineageOrigin } from './lineage-client.js';
import { ConnectionReadSchema, ConnectionListSchema, endpointOrigin, type Connection, type ConnectionList } from './connection-contracts.js';

/** Finite host configuration. No renderer-provided URLs, paths, or commands. */
export interface ConnectionSettings { lineageSnapshot?: string; lineageURL?: string; zendeskSnapshot?: string }
function settings(): ConnectionSettings {
  const directory = typeof __dirname === 'string' ? __dirname : dirname(fileURLToPath(import.meta.url));
  return { lineageSnapshot: process.env.SEMANTIC_LINEAGE_SNAPSHOT, lineageURL: process.env.SEMANTIC_LINEAGE_URL,
    zendeskSnapshot: process.env.SEMANTIC_ZENDESK_SNAPSHOT ?? resolve(directory, '../../../var/zendesk-snapshot') };
}
/** Reads one health result and configured filesystem metadata; never starts a provider or retries. */
export async function readConnections(raw: unknown, config = settings(), fetcher?: ReadFetch): Promise<ConnectionList> {
  ConnectionReadSchema.parse(raw);
  const checked_at = new Date().toISOString();
  const row = (id: Connection['id'], transport: Connection['transport'], status: Connection['status'], detail: Connection['detail'], endpoint?: string): Connection =>
    ({ id, transport, status, detail, checked_at, ...(endpoint ? { endpoint } : {}) });
  const health = async (): Promise<Connection[]> => {
    try {
      const data = z.object({ status: z.literal('ok'), tracking_uri: z.string().max(2048) }).parse(
        await boundedJSON('http://127.0.0.1:5056/health', fetcher, 16_000));
      const endpoint = endpointOrigin(data.tracking_uri);
      return [row('api', 'HTTP', 'ready', 'api-ready', 'http://127.0.0.1:5056'),
        row('mlflow', endpoint ? (endpoint.startsWith('https:') ? 'HTTPS' : 'HTTP') : 'host managed', endpoint ? 'ready' : 'configured', endpoint ? 'storage-ready' : 'storage-hidden', endpoint)];
    } catch {
      return [row('api', 'HTTP', 'unavailable', 'api-unavailable', 'http://127.0.0.1:5056'),
        row('mlflow', 'host managed', 'unavailable', 'storage-unavailable')];
    }
  };
  const local = async (id: 'lineage' | 'zendesk', path: string | undefined): Promise<Connection> => {
    const file = id === 'lineage'; const transport = file ? 'local file' : 'local directory';
    if (path === undefined) return row(id, transport, 'not-configured', 'not-configured');
    try {
      if (!isAbsolute(path)) throw new Error('Absolute path required.');
      const info = await (file ? lstat(path) : stat(path));
      if (file ? !info.isFile() || info.size > 32_000_000 : !info.isDirectory()) throw new Error('Invalid metadata.');
      return row(id, transport, 'configured', file ? 'file-present' : 'directory-present');
    } catch { return row(id, transport, 'unavailable', file ? 'file-unavailable' : 'directory-unavailable'); }
  };
  const lineage = async (): Promise<Connection> => {
    if (config.lineageSnapshot !== undefined) return local('lineage', config.lineageSnapshot);
    try { return row('lineage', 'HTTP', 'configured', 'http-unchecked', lineageOrigin(config.lineageURL)); }
    catch { return row('lineage', 'HTTP', 'unavailable', 'invalid-origin'); }
  };
  const [services, graph, knowledge] = await Promise.all([health(), lineage(), local('zendesk', config.zendeskSnapshot)]);
  return ConnectionListSchema.parse({ checked_at, connections: [...services,
    row('codex', 'stdio', 'configured', 'native-unchecked'), row('mcp', 'stdio', 'configured', 'mcp-unchecked'), graph, knowledge,
    row('help', 'HTTPS', 'configured', 'public-unchecked', 'https://support.precisionlender.com')] });
}
