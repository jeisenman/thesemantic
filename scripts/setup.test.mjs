import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { configure, tomlString } from './setup.mjs';

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'semantic-setup-'));
  mkdirSync(join(directory, 'checkout', '.codex'), {recursive: true});
  writeFileSync(join(directory, 'checkout', '.env.example'), 'MLFLOW_TRACKING_URI=http://127.0.0.1:5055\n');
  t.after(() => rmSync(directory, {recursive: true, force: true}));
  return directory;
}

test('configure creates local files and encodes executable paths as TOML strings', (t) => {
  const directory = fixture(t);
  const local = join(directory, 'checkout "quoted"');
  mkdirSync(join(local, '.codex'), {recursive: true});
  copyFileSync(join(directory, 'checkout', '.env.example'), join(local, '.env.example'));
  const spaced = join(local, 'target', 'debug', 'researcher-codex');
  configure(local);
  assert.equal(readFileSync(join(local, '.env'), 'utf8'), 'MLFLOW_TRACKING_URI=http://127.0.0.1:5055\n');
  const config = readFileSync(join(local, '.codex', 'config.toml'), 'utf8');
  assert.ok(config.includes(`command = ${tomlString(spaced)}`));
  assert.ok(!config.includes('/Users/'));
  assert.equal(tomlString('C:\\checkout\\Semantic'), '"C:\\\\checkout\\\\Semantic"');
});

test('configure preserves existing local environment and Codex configuration', (t) => {
  const directory = fixture(t);
  const local = join(directory, 'checkout');
  mkdirSync(join(local, '.codex'), {recursive: true});
  writeFileSync(join(local, '.env'), 'PRIVATE_SETTING=keep\n');
  writeFileSync(join(local, '.codex', 'config.toml'), 'existing = true\n');
  configure(local);
  assert.equal(readFileSync(join(local, '.env'), 'utf8'), 'PRIVATE_SETTING=keep\n');
  assert.equal(readFileSync(join(local, '.codex', 'config.toml'), 'utf8'), 'existing = true\n');
});

test('CLI rejects unknown setup flags', () => {
  const result = spawnSync(process.execPath, [new URL('./setup.mjs', import.meta.url).pathname, '--typo'], {encoding: 'utf8'});
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unknown setup option: --typo/);
});
