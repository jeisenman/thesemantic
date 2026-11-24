import { z } from 'zod';

export const ConnectionReadSchema = z.object({ operation: z.literal('connections.list') }).strict();
export const ConnectionIDSchema = z.enum(['api', 'mlflow', 'codex', 'mcp', 'lineage', 'zendesk', 'help']);
/** Returns a credential-free HTTP origin. All path and request details are omitted. */
export function endpointOrigin(raw: string): string | undefined {
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return undefined;
    return url.origin;
  } catch { return undefined; }
}
const EndpointSchema = z.string().max(256).refine(value => endpointOrigin(value) === value);
export const ConnectionSchema = z.object({
  id: ConnectionIDSchema,
  status: z.enum(['ready', 'configured', 'not-configured', 'unavailable']),
  transport: z.enum(['HTTP', 'HTTPS', 'stdio', 'local file', 'local directory', 'host managed']),
  endpoint: EndpointSchema.optional(),
  checked_at: z.iso.datetime(),
  detail: z.enum(['api-ready', 'api-unavailable', 'storage-ready', 'storage-unavailable', 'storage-hidden',
    'native-unchecked', 'mcp-unchecked', 'file-present', 'file-unavailable', 'directory-present',
    'directory-unavailable', 'not-configured', 'http-unchecked', 'invalid-origin', 'public-unchecked']),
}).strict();
/** Public connection metadata contains no settings payload, credential, or local path. */
export const ConnectionListSchema = z.object({
  checked_at: z.iso.datetime(), connections: z.array(ConnectionSchema).length(7),
}).strict().superRefine((value, context) => {
  if (new Set(value.connections.map(item => item.id)).size !== 7) context.addIssue({ code: 'custom', message: 'Connection inventory must contain each service once.' });
});
export type Connection = z.infer<typeof ConnectionSchema>;
export type ConnectionList = z.infer<typeof ConnectionListSchema>;
