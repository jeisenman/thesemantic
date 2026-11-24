import assert from 'node:assert/strict';
import { chmodSync, copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const source = fileURLToPath(new URL('./start.mjs', import.meta.url));

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'semantic-start-'));
  mkdirSync(join(root, 'scripts'));
  copyFileSync(source, join(root, 'scripts', 'start.mjs'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  return root;
}

test('researcher loads .env and forwards args to the checkout Rust executable', (t) => {
  const root = fixture(t);
  const binary = join(root, 'target', 'debug', 'researcher-codex');
  mkdirSync(join(root, 'target', 'debug'), {recursive: true});
  const resultPath = join(root, 'result.txt');
  writeFileSync(binary, '#!/bin/sh\nprintf "%s\\n" "$SEMANTIC_TEST_VALUE" "$CALLER_VALUE" "$@" > "$RESULT_FILE"\n');
  chmodSync(binary, 0o755);
  writeFileSync(join(root, '.env'), 'SEMANTIC_TEST_VALUE=from-file\nCALLER_VALUE=file-value\n');
  const result = spawnSync(process.execPath, [join(root, 'scripts', 'start.mjs'), 'researcher', '--check', '--mode', 'safe'], {
    encoding: 'utf8',
    env: {...process.env, CALLER_VALUE: 'caller-value', RESULT_FILE: resultPath},
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(resultPath, 'utf8'), 'from-file\ncaller-value\nchat\n--check\n--mode\nsafe\n');
});

test('missing .env reports the setup command', (t) => {
  const root = fixture(t);
  const result = spawnSync(process.execPath, [join(root, 'scripts', 'start.mjs'), 'researcher'], {encoding: 'utf8'});
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Local \.env is missing; run npm run setup first\./);
});

test('api and desktop reject arguments instead of dropping them', (t) => {
  const root = fixture(t);
  writeFileSync(join(root, '.env'), '');
  for (const mode of ['api', 'desktop']) {
    const result = spawnSync(process.execPath, [join(root, 'scripts', 'start.mjs'), mode, '--unexpected'], {encoding: 'utf8'});
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, new RegExp(`The ${mode} command does not accept arguments\\.`));
  }
});
