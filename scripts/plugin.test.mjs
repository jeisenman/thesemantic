import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, cpSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { prepare, validateApiOrigin } from './plugin.mjs';
import { readInstallation } from '../plugins/semantic/scripts/launch.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'semantic-plugin-'));
  mkdirSync(join(dir, 'target/debug'), { recursive: true });
  mkdirSync(join(dir, 'packages/runtime/dist'), { recursive: true });
  writeFileSync(join(dir, 'target/debug/researcher-codex'), 'fixture');
  writeFileSync(join(dir, 'packages/runtime/dist/main.js'), 'fixture');
  return dir;
}

test('accepts only loopback API origins', () => {
  assert.equal(validateApiOrigin('http://127.0.0.1:5056'), 'http://127.0.0.1:5056');
  for (const bad of ['https://127.0.0.1:5056', 'http://localhost:5056', 'http://127.0.0.1:5056/path',
    'http://user:pass@127.0.0.1:5056', 'http://192.168.1.1:5056']) {
    assert.throws(() => validateApiOrigin(bad), /loopback/);
  }
});

test('prepares the catalog-resolved plugin and copies the existing skill unchanged', () => {
  const app = fixture();
  const output = join(app, 'marketplace');
  try {
    const dir = prepare({ applicationRoot: app, outputRoot: output });
    const packageRoot = join(dir, 'plugins/semantic');
    assert.deepEqual(JSON.parse(readFileSync(join(packageRoot, 'installation.json'))), {
      applicationRoot: app, apiOrigin: 'http://127.0.0.1:5056',
    });
    assert.equal(readFileSync(join(packageRoot, 'skills/research-run/SKILL.md'), 'utf8'),
      readFileSync(join(root, '.codex/skills/research-run/SKILL.md'), 'utf8'));
    assert.equal(existsSync(join(packageRoot, '.env')), false);
    assert.equal(existsSync(join(packageRoot, 'installation.json')), true);
    const marketplace = JSON.parse(readFileSync(join(dir, '.agents/plugins/marketplace.json')));
    assert.equal(marketplace.plugins[0].source.path, './plugins/semantic');
    assert.equal(existsSync(join(dir, marketplace.plugins[0].source.path, 'plugin.json')), true);
    const manifest = JSON.parse(readFileSync(join(packageRoot, 'plugin.json')));
    assert.equal(manifest.extensions['com.openai'].interface.displayName, 'The Semantic');
    prepare({ applicationRoot: app, outputRoot: output });
    assert.equal(readFileSync(join(output, '.semantic-local-marketplace'), 'utf8'), 'semantic-local-marketplace-v1\n');
  } finally { rmSync(app, { recursive: true, force: true }); }
});

test('invalid configuration does not replace an existing marketplace', () => {
  const app = fixture();
  const output = join(app, 'marketplace');
  mkdirSync(output);
  writeFileSync(join(output, 'marker'), 'keep');
  try {
    assert.throws(() => prepare({ applicationRoot: app, outputRoot: output, apiUrl: 'https://example.com' }));
    assert.equal(readFileSync(join(output, 'marker'), 'utf8'), 'keep');
    assert.throws(() => prepare({ applicationRoot: app, outputRoot: output }), /Refusing to replace/);
    assert.throws(() => prepare({ applicationRoot: app, outputRoot: app }), /cannot replace/);
    assert.equal(readFileSync(join(output, 'marker'), 'utf8'), 'keep');
    rmSync(join(app, 'target/debug/researcher-codex'));
    assert.throws(() => prepare({ applicationRoot: app, outputRoot: output }), /missing/);
    assert.equal(readFileSync(join(output, 'marker'), 'utf8'), 'keep');
  } finally { rmSync(app, { recursive: true, force: true }); }
});

test('launcher rejects oversized and noncanonical installation settings', () => {
  const app = fixture();
  const config = join(app, 'installation.json');
  try {
    writeFileSync(config, JSON.stringify({ applicationRoot: app, apiOrigin: 'http://user@127.0.0.1:5056' }));
    assert.throws(() => readInstallation(config), /loopback/);
    writeFileSync(config, JSON.stringify({ applicationRoot: app, apiOrigin: 'http://127.0.0.1:5056', extra: true }));
    assert.throws(() => readInstallation(config), /invalid/);
    writeFileSync(config, ' '.repeat(4097));
    assert.throws(() => readInstallation(config), /invalid/);
  } finally { rmSync(app, { recursive: true, force: true }); }
});

test('launcher starts its MCP fixture with the configured app paths', () => {
  const app = fixture();
  const packageRoot = join(app, 'plugin');
  cpSync(join(root, 'plugins/semantic'), packageRoot, { recursive: true });
  const executable = join(app, 'target/debug/researcher-codex');
  const resultPath = join(app, 'result.json');
  writeFileSync(executable, `#!/usr/bin/env node\nrequire('node:fs').writeFileSync(${JSON.stringify(resultPath)}, JSON.stringify({ api: process.env.SEMANTIC_API_URL, runtime: process.env.SEMANTIC_RUNTIME, root: process.env.SEMANTIC_PROJECT_ROOT, debug: process.env.Q2_MCP_DEBUG }));\n`);
  chmodSync(executable, 0o755);
  writeFileSync(join(packageRoot, 'installation.json'), JSON.stringify({ applicationRoot: app, apiOrigin: 'http://127.0.0.1:5099' }));
  try {
    const result = spawnSync(process.execPath, [join(packageRoot, 'scripts/launch.mjs')], {
      encoding: 'utf8', timeout: 5000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(readInstallation(join(packageRoot, 'installation.json')), {
      applicationRoot: app, apiOrigin: 'http://127.0.0.1:5099',
      executable, runtime: join(app, 'packages/runtime/dist/main.js'),
    });
    assert.deepEqual(JSON.parse(readFileSync(resultPath, 'utf8')), {
      api: 'http://127.0.0.1:5099', runtime: join(app, 'packages/runtime/dist/main.js'),
      root: app, debug: '1',
    });
  } finally { rmSync(app, { recursive: true, force: true }); }
});

test('plugin prepare rejects an incomplete API option', () => {
  const result = spawnSync(process.execPath, [join(root, 'scripts/plugin.mjs'), '--api-url'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage:/);
});

test('launcher forwards Codex shutdown signals to its MCP child', async () => {
  const app = fixture();
  const packageRoot = join(app, 'plugin');
  cpSync(join(root, 'plugins/semantic'), packageRoot, { recursive: true });
  const executable = join(app, 'target/debug/researcher-codex');
  const readyPath = join(app, 'ready');
  const signalPath = join(app, 'signal');
  writeFileSync(executable, `#!/usr/bin/env node\nconst fs=require('node:fs'); fs.writeFileSync(${JSON.stringify(readyPath)},'ready'); process.on('SIGTERM',()=>{fs.writeFileSync(${JSON.stringify(signalPath)},'forwarded'); process.exit(0)}); setInterval(()=>{},1000);\n`);
  chmodSync(executable, 0o755);
  writeFileSync(join(packageRoot, 'installation.json'), JSON.stringify({ applicationRoot: app, apiOrigin: 'http://127.0.0.1:5099' }));
  const launcher = spawn(process.execPath, [join(packageRoot, 'scripts/launch.mjs')], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  launcher.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
  try {
    const deadline = Date.now() + 5000;
    while (!existsSync(readyPath) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(existsSync(readyPath), true, `MCP fixture did not start: ${stderr}`);
    launcher.kill('SIGTERM');
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('launcher did not exit after SIGTERM')), 5000);
      launcher.once('exit', () => { clearTimeout(timer); resolve(); });
    });
    assert.equal(readFileSync(signalPath, 'utf8'), 'forwarded');
  } finally {
    if (launcher.exitCode === null) launcher.kill('SIGKILL');
    rmSync(app, { recursive: true, force: true });
  }
});
