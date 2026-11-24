import { read } from './client.js';
import { el, button, utc } from './dom.js';
import { ConnectionListSchema, type Connection, type ConnectionList } from './connection-contracts.js';

const labels: Record<Connection['id'], string> = { api: 'Semantic API', mlflow: 'MLflow storage', codex: 'Native Codex', mcp: 'Semantic MCP', lineage: 'Lineage source', zendesk: 'Zendesk snapshot', help: 'Public Help Center' };
const statuses: Record<Connection['status'], string> = { ready: 'Ready', configured: 'Configured · not verified', 'not-configured': 'Not configured', unavailable: 'Unavailable' };
const descriptions: Record<Connection['detail'], string> = {
  'api-ready': 'The local API health read passed.',
  'api-unavailable': 'The local API health read failed. Start the Semantic API, then refresh.',
  'storage-ready': 'The API health read verified access to its MLflow experiment. This does not check every stored record.',
  'storage-unavailable': 'Storage readiness cannot be verified because the API health read failed. Check the API and MLflow settings.',
  'storage-hidden': 'The API verified storage access. Its endpoint is omitted because it is not a credential-free HTTP origin.',
  'native-unchecked': 'Native Codex uses its own login store. Binary access, authentication and model access were not checked. Send a message in Codex to use this connection.',
  'mcp-unchecked': 'The Rust Semantic MCP uses standard input and output. Client installation, registration and process health were not checked. It has no HTTP endpoint.',
  'file-present': 'A regular local export file is present within the size limit. Contents, freshness and coverage were not checked. Open Lineage to validate the graph.',
  'file-unavailable': 'The configured lineage export is unavailable or has invalid file metadata. Check the host setting. No HTTP fallback was used.',
  'directory-present': 'The local snapshot directory is present. The manifest and articles were not checked. Open Zendesk to validate the snapshot.',
  'directory-unavailable': 'The configured snapshot directory is unavailable. Check the host setting and snapshot location.',
  'not-configured': 'No host-local snapshot is configured.',
  'http-unchecked': 'The loopback lineage origin is configured. No graph request was made. Open Lineage to read and validate it.',
  'invalid-origin': 'The lineage setting is invalid. Use a credential-free HTTP loopback origin without a path, query or fragment.',
  'public-unchecked': 'The fixed public documentation origin is configured. No public request was made. This does not provide private ticket access.',
};
const setup: Record<Connection['id'], string> = {
  api: 'If the API is unavailable, start it on port 5056.', mlflow: 'Set MLFLOW_TRACKING_URI for the API process. Restart the API after a change.',
  codex: 'Use native Codex login. CODEX_BINARY can select the installed binary. Restart the app after a host setting change.',
  mcp: 'Register the built Rust Semantic MCP in the Codex plugin or client configuration.',
  lineage: 'Set SEMANTIC_LINEAGE_SNAPSHOT to an absolute export path, or SEMANTIC_LINEAGE_URL to a loopback HTTP origin. The snapshot takes precedence. Restart the app after a change.',
  zendesk: 'Set SEMANTIC_ZENDESK_SNAPSHOT to an absolute snapshot directory, or provide var/zendesk-snapshot. Restart the app after a change.',
  help: 'The public documentation origin is fixed. No account setting is required.',
};
/** Mounts one read-only connection page. Refresh performs one bounded host read. */
export function mountConnections(host: HTMLElement, mode: 'Connections' | 'Integrations', reader = read): () => void {
  let disposed = false; let pending = false; let snapshot: ConnectionList | undefined;
  let query = ''; let filter = 'all';
  const root = el('section', '', 'connections-workspace'); host.append(root);
  const intro = el('div', '', 'intro');
  intro.append(el('p', `LOCAL PLATFORM / ${mode.toUpperCase()}`, 'eyebrow'), el('h1', mode === 'Connections' ? 'Connect the\nresearch desk.' : 'Know each\nconnection.'),
    el('p', mode === 'Connections' ? 'Read the setup and readiness of each local service and knowledge source.' : 'Inspect configured endpoints, transports and the scope of each check.', 'lead'));
  const controls = el('div', '', 'connection-controls'); const checked = el('p', 'No check completed.', 'caption'); checked.setAttribute('role', 'status');
  const refresh = button('Refresh checks ↻', () => { void load(); }, 'refresh'); controls.append(checked, refresh);
  const error = el('p', '', 'error'); error.setAttribute('role', 'alert'); error.hidden = true;
  const stats = el('div', '', 'connection-stats');
  const search = el('input'); search.type = 'search'; search.placeholder = 'Search services or endpoints'; search.setAttribute('aria-label', 'Search connections');
  const select = el('select'); select.setAttribute('aria-label', 'Filter connection status');
  for (const [value, label] of [['all', 'All statuses'], ['ready', 'Ready'], ['configured', 'Configured · not verified'], ['not-configured', 'Not configured'], ['unavailable', 'Unavailable']]) {
    const option = el('option', label); option.value = value!; select.append(option);
  }
  const filters = el('div', '', 'toolbar'); filters.append(search, select);
  const inventory = el('div', '', 'connection-inventory');
  const note = el('p', 'Checks are manual snapshots. Local file checks read metadata only. Endpoint paths and request details are omitted. Credentials are managed by the host or native Codex.', 'caption');
  root.append(intro, controls, error, stats, filters, inventory, note);
  const draw = () => {
    stats.replaceChildren(); inventory.replaceChildren();
    if (!snapshot) { inventory.append(el('p', pending ? 'Reading connection metadata…' : 'Connection metadata is unavailable.', 'empty')); return; }
    for (const [title, value] of [['Services', snapshot.connections.length], ['Ready', snapshot.connections.filter(c => c.status === 'ready').length], ['Not verified', snapshot.connections.filter(c => c.status === 'configured').length], ['Needs setup', snapshot.connections.filter(c => ['unavailable', 'not-configured'].includes(c.status)).length]]) {
      const box = el('div', '', 'connection-stat'); box.append(el('span', String(title), 'eyebrow'), el('strong', String(value))); stats.append(box);
    }
    const rows = snapshot.connections.filter(c => (filter === 'all' || filter === c.status) && `${labels[c.id]} ${c.endpoint ?? ''} ${c.transport}`.toLowerCase().includes(query.toLowerCase()));
    if (!rows.length) inventory.append(el('p', 'No connections match these filters.', 'empty'));
    for (const c of rows) {
      const article = el('article', '', 'connection-card');
      const heading = el('div', '', 'connection-card-heading'); const badge = el('span', statuses[c.status], `connection-status ${c.status}`);
      heading.append(el('h2', labels[c.id]), badge); article.append(heading);
      if (mode === 'Integrations') {
        const endpoint = c.endpoint ?? (c.transport === 'stdio' ? 'Standard input / output · no URL' : c.transport.startsWith('local') ? 'Host-local source · path withheld' : 'Endpoint unavailable');
        article.append(el('code', endpoint, 'connection-endpoint'), el('p', `Transport: ${c.transport}`, 'caption'));
      }
      article.append(el('p', descriptions[c.detail]));
      if (mode === 'Connections') article.append(el('p', setup[c.id], 'connection-setup'));
      article.append(el('p', `Checked ${utc(c.checked_at)} · ${['api', 'mlflow'].includes(c.id) ? 'Health read' : c.transport.startsWith('local') ? 'Filesystem metadata' : 'Configuration only'}`, 'caption'));
      inventory.append(article);
    }
  };
  search.oninput = () => { query = search.value; draw(); }; select.onchange = () => { filter = select.value; draw(); };
  async function load(): Promise<void> {
    if (disposed || pending) return;
    pending = true; refresh.disabled = true; error.hidden = true;
    checked.textContent = snapshot ? 'Refreshing… Previous results remain visible until this check completes.' : 'Reading connection metadata…'; draw();
    try {
      const next = ConnectionListSchema.parse(await reader({ operation: 'connections.list' }));
      if (disposed) return;
      snapshot = next; checked.textContent = `Last refreshed ${utc(next.checked_at)}`;
    } catch {
      if (disposed) return;
      checked.textContent = snapshot ? `Previous snapshot ${utc(snapshot.checked_at)} · refresh failed` : 'No check completed.';
      error.textContent = 'Connection metadata could not be read. Restart the desktop app, then refresh. Previous results, if shown, are stale.'; error.hidden = false;
    } finally {
      if (!disposed) { pending = false; refresh.disabled = false; draw(); }
    }
  }
  void load();
  return () => { disposed = true; search.oninput = null; select.onchange = null; root.remove(); };
}
