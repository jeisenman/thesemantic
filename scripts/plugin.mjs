import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

/** Accept only a plain loopback HTTP origin. */
export function validateApiOrigin(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('API URL must be an HTTP loopback origin, such as http://127.0.0.1:5056.'); }
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password
    || url.pathname !== '/' || url.search || url.hash || !url.port || url.origin !== value.replace(/\/$/, '')) {
    throw new Error('API URL must be an HTTP loopback origin, such as http://127.0.0.1:5056.');
  }
  return url.origin;
}

/** Prepare the ignored local Codex marketplace from a built app checkout. */
export function prepare({ applicationRoot = root, apiUrl = 'http://127.0.0.1:5056', outputRoot = join(root, 'var/codex-marketplace') } = {}) {
  const app = resolve(applicationRoot);
  const apiOrigin = validateApiOrigin(apiUrl);
  const executable = join(app, 'target/debug/researcher-codex');
  const runtime = join(app, 'packages/runtime/dist/main.js');
  for (const file of [executable, runtime]) {
    if (!existsSync(file)) throw new Error(`Built Semantic app file is missing: ${file}. Build the runtime and Rust CLI first.`);
  }
  const destination = resolve(outputRoot);
  const overlapsSource = (path) => destination === path || path.startsWith(destination + sep);
  if (overlapsSource(app) || overlapsSource(join(root, 'plugins/semantic')) || destination === app) {
    throw new Error('Marketplace output cannot replace the Semantic checkout or plugin source.');
  }
  const parent = dirname(destination);
  mkdirSync(parent, { recursive: true });
  if (existsSync(destination)) {
    const marker = join(destination, '.semantic-local-marketplace');
    const catalog = join(destination, '.agents/plugins/marketplace.json');
    let knownCatalog = false;
    try { knownCatalog = JSON.parse(readFileSync(catalog, 'utf8')).name === 'semantic-local'; } catch { /* invalid catalog */ }
    if (!existsSync(marker) || !knownCatalog || readFileSync(marker, 'utf8') !== 'semantic-local-marketplace-v1\n') {
      throw new Error('Refusing to replace an existing directory that is not a generated Semantic marketplace.');
    }
  }
  const staging = mkdtempSync(join(parent, '.semantic-marketplace-stage-'));
  const backup = mkdtempSync(join(parent, '.semantic-marketplace-backup-'));
  rmSync(backup, { recursive: true, force: true });
  let movedOld = false;
  try {
    const agentPlugins = join(staging, '.agents/plugins');
    const plugins = join(staging, 'plugins');
    mkdirSync(agentPlugins, { recursive: true });
    mkdirSync(plugins, { recursive: true });
    writeFileSync(join(agentPlugins, 'marketplace.json'), JSON.stringify({
      name: 'semantic-local', extensions: { 'com.openai': { interface: { displayName: 'Semantic Local' } } },
      plugins: [{ name: 'semantic', source: { source: 'local', path: './plugins/semantic' },
        policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Productivity' }],
    }, null, 2) + '\n');
    const packagePath = join(plugins, 'semantic');
    cpSync(join(root, 'plugins/semantic'), packagePath, { recursive: true });
    cpSync(join(root, '.codex/skills/research-run'), join(packagePath, 'skills/research-run'), { recursive: true });
    writeFileSync(join(packagePath, 'installation.json'), JSON.stringify({ applicationRoot: app, apiOrigin }, null, 2) + '\n');
    writeFileSync(join(staging, '.semantic-local-marketplace'), 'semantic-local-marketplace-v1\n');
    if (existsSync(destination)) {
      renameSync(destination, backup);
      movedOld = true;
    }
    renameSync(staging, destination);
    if (movedOld) rmSync(backup, { recursive: true, force: true });
  } catch (error) {
    if (movedOld && !existsSync(destination)) renameSync(backup, destination);
    rmSync(staging, { recursive: true, force: true });
    rmSync(backup, { recursive: true, force: true });
    throw error;
  }
  return destination;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    const args = process.argv.slice(2);
    if ((args.length !== 0 && args.length !== 2) || (args.length === 2 && (args[0] !== '--api-url' || !args[1]))) {
      throw new Error('Usage: npm run plugin:prepare [--api-url http://127.0.0.1:5056]');
    }
    const output = prepare({ apiUrl: args[1] ?? 'http://127.0.0.1:5056' });
    console.log(`Prepared local Codex marketplace at ${output}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Plugin preparation failed.');
    process.exitCode = 1;
  }
}
