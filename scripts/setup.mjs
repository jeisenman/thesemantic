import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
/** Encodes an executable path as a TOML basic string. */
export function tomlString(value) {
  return JSON.stringify(value);
}

/** Creates clone-specific local configuration without replacing existing files. */
export function configure(directory = root) {
  const envPath = join(directory, '.env');
  if (!existsSync(envPath)) copyFileSync(join(directory, '.env.example'), envPath);
  const codexDirectory = join(directory, '.codex');
  mkdirSync(codexDirectory, {recursive: true});
  const configPath = join(codexDirectory, 'config.toml');
  if (!existsSync(configPath)) {
    const executable = join(directory, 'target', 'debug', 'researcher-codex');
    const config = `[mcp_servers.semantic_research]\ncommand = ${tomlString(executable)}\nargs = ["mcp"]\nstartup_timeout_sec = 15\ntool_timeout_sec = 320\nrequired = true\n\n[mcp_servers.semantic_research.env]\nSEMANTIC_API_URL = "http://127.0.0.1:5056"\nQ2_MCP_DEBUG = "1"\n`;
    writeFileSync(configPath, config, {flag: 'wx'});
  }
}

/** Runs one setup command and stops setup on failure. */
export function run(command, args, cwd = root) {
  const result = spawnSync(command, args, {cwd, stdio: 'inherit'});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

/** Configures and builds this checkout, or only writes missing configuration. */
export function main(argv = process.argv.slice(2)) {
  const args = new Set(argv);
  for (const arg of args) {
    if (arg !== '--configure-only') throw new Error(`Unknown setup option: ${arg}`);
  }
  if (args.size !== argv.length) throw new Error('Setup options cannot be repeated.');
  configure();
  console.log('Created local .env and Codex configuration when missing.');
  if (!args.has('--configure-only')) {
    run('uv', ['sync', '--project', 'server', '--locked']);
    run('npm', ['ci']);
    mkdirSync(join(root, 'target'), {recursive: true});
    run('go', ['build', '-o', 'target/semantic-lineage-build', './tools/lineagebuild']);
    run('cargo', ['build', '--workspace', '--locked']);
    run('npm', ['run', 'build']);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) {
    console.error(error instanceof Error ? error.message : 'Setup failed.');
    process.exit(1);
  }
}
