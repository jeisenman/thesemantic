import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// This prepares only a new synthetic checkout and explicit build configuration.
const [directory, output, ...extra] = process.argv.slice(2);
if (!directory || !output || extra.length || !isAbsolute(directory) || !isAbsolute(output)) {
  throw new Error('Usage: node prepare.mjs ABSOLUTE_NEW_DIRECTORY ABSOLUTE_OUTPUT_FILE');
}
await mkdir(directory); // Never reuse or change an existing source directory.
const sourceRoot = join(directory, 'source');
await mkdir(sourceRoot);
const here = fileURLToPath(new URL('.', import.meta.url));
const source = await readFile(join(here, 'schema.py'));
await writeFile(join(sourceRoot, 'schema.py'), source);
const git = (...args) => execFileSync('git', ['-C', sourceRoot, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
git('init', '--quiet');
git('add', 'schema.py');
git('-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Synthetic Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Synthetic schema fixture');
const commit = git('rev-parse', 'HEAD');
const digest = createHash('sha256').update(source).digest('hex');
const template = await readFile(join(here, 'manifest.template.json'), 'utf8');
const manifest = JSON.parse(template.replaceAll('REPLACE_WITH_FULL_COMMIT', commit).replaceAll('REPLACE_WITH_SOURCE_SHA256', digest));
const manifestPath = join(directory, 'manifest.json');
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
await writeFile(join(directory, 'config.json'), JSON.stringify({ manifest: manifestPath, roots: { synthetic: sourceRoot }, output }, null, 2) + '\n');
console.log('Prepared synthetic source checkout and config.json. No production source or provider was accessed.');
