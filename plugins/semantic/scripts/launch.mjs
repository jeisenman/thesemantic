import { constants, openSync, readSync, statSync, fstatSync, closeSync, accessSync, realpathSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const pluginRoot = fileURLToPath(new URL('../', import.meta.url));

/** Validate the generated local installation settings. */
export function readInstallation(path = resolve(pluginRoot, 'installation.json')) {
  let fd;
  let data;
  try {
    const stat = statSync(path);
    if (!stat.isFile() || stat.size > 4096) throw new Error('invalid size or file type');
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.size > 4096) throw new Error('invalid opened file');
    const buffer = Buffer.alloc(4097);
    const bytes = readSync(fd, buffer, 0, buffer.length, 0);
    if (bytes > 4096) throw new Error('oversized configuration');
    data = JSON.parse(buffer.subarray(0, bytes).toString('utf8'));
  } catch {
    throw new Error('Plugin installation is missing or invalid; run npm run plugin:prepare in The Semantic checkout.');
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
  if (!data || Object.keys(data).sort().join(',') !== 'apiOrigin,applicationRoot'
    || typeof data.applicationRoot !== 'string' || !isAbsolute(data.applicationRoot)
    || typeof data.apiOrigin !== 'string') {
    throw new Error('Plugin installation is invalid; run npm run plugin:prepare in The Semantic checkout.');
  }
  const applicationRoot = resolve(data.applicationRoot);
  let origin;
  try { origin = new URL(data.apiOrigin); } catch { throw new Error('Plugin API origin must be a credential-free loopback HTTP origin.'); }
  if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || origin.username || origin.password
    || origin.pathname !== '/' || origin.search || origin.hash || !origin.port
    || origin.origin !== data.apiOrigin) {
    throw new Error('Plugin API origin must be a loopback HTTP origin.');
  }
  const executable = resolve(applicationRoot, 'target/debug/researcher-codex');
  const runtime = resolve(applicationRoot, 'packages/runtime/dist/main.js');
  try {
    if (!statSync(executable).isFile() || !statSync(runtime).isFile()) throw new Error();
    accessSync(executable, constants.X_OK);
  } catch {
    throw new Error('Semantic app build is missing; run npm run build:runtime and cargo build -p researcher-codex.');
  }
  return { applicationRoot, apiOrigin: origin.origin, executable, runtime };
}

/** Launch the installed app MCP while preserving stdio for the host protocol. */
export function main() {
  try {
    const settings = readInstallation();
    try { process.loadEnvFile(resolve(settings.applicationRoot, '.env')); }
    catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error;
    }
    const child = spawn(settings.executable, ['mcp'], {
      cwd: settings.applicationRoot,
      stdio: 'inherit',
      env: { ...process.env, SEMANTIC_API_URL: settings.apiOrigin,
        SEMANTIC_RUNTIME: settings.runtime, SEMANTIC_PROJECT_ROOT: settings.applicationRoot,
        Q2_MCP_DEBUG: '1' },
    });
    child.on('error', (error) => { console.error(`Semantic MCP launch failed: ${error.message}`); process.exitCode = 1; });
    child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.on(signal, () => {
        if (child.exitCode === null && child.signalCode === null) child.kill(signal);
      });
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Semantic plugin setup failed.');
    process.exitCode = 1;
  }
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) main();
