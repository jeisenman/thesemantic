import { existsSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));

/** Loads local settings and launches the selected application process. */
export function main(mode, forwarded = []) {
  if (!['api', 'desktop', 'researcher'].includes(mode)) {
    throw new Error('Choose api, desktop, or researcher.');
  }
  if (mode !== 'researcher' && forwarded.length > 0) {
    throw new Error(`The ${mode} command does not accept arguments.`);
  }
  try {
    process.loadEnvFile(resolve(root, '.env'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      throw new Error('Local .env is missing; run npm run setup first.');
    }
    throw error;
  }
  const executable = resolve(root, 'target/debug/researcher-codex');
  if (mode === 'researcher' && !existsSync(executable)) {
    throw new Error('Rust executable is missing; run npm run setup first.');
  }
  const command = mode === 'api' ? 'uv' : mode === 'desktop' ? 'npm' : executable;
  const args = mode === 'api'
    ? ['run', '--project', 'server', 'semantic-api']
    : mode === 'desktop'
      ? ['run', 'start', '--workspace', '@the-semantic/desktop']
      : forwarded;
  const commandArgs = mode === 'researcher' ? ['chat', ...args] : args;
  const result = spawnSync(command, commandArgs, {cwd: root, stdio: 'inherit', env: process.env});
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  try { main(process.argv[2], process.argv.slice(3)); } catch (error) {
    console.error(error instanceof Error ? error.message : 'Start failed.');
    process.exit(1);
  }
}
