import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const outputs = ['host.js', 'host.js.map', 'client.js', 'preview.js', 'index.html'];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
async function sourceFingerprint(root) {
  const files = ['package.json', 'package-lock.json', 'tsconfig.json', 'scripts/build.mjs', 'scripts/build-integrity.mjs'];
  async function walk(relative) {
    for (const entry of await readdir(join(root, relative), { withFileTypes: true })) {
      const file = `${relative}/${entry.name}`;
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile()) files.push(file);
    }
  }
  await walk('src');
  const hash = createHash('sha256');
  for (const file of files.sort()) hash.update(`${file}\0${sha256(await readFile(join(root, file)))}\n`);
  return hash.digest('hex');
}
export async function writeBuildManifest(root = resolve('.')) {
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const files = {};
  for (const file of outputs) files[file] = sha256(await readFile(join(root, 'dist', file)));
  await writeFile(join(root, 'dist/build-info.json'), JSON.stringify({ version: manifest.version, sourceHash: await sourceFingerprint(root), files }, null, 2) + '\n');
}
export async function verifyBuild(root = resolve('.'), checkSources = true) {
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const build = JSON.parse(await readFile(join(root, 'dist/build-info.json'), 'utf8'));
  assert.equal(build.version, manifest.version, 'Build version differs from package.json; rebuild before publishing');
  assert.deepEqual(Object.keys(build.files).sort(), [...outputs].sort());
  for (const file of outputs) assert.equal(sha256(await readFile(join(root, 'dist', file))), build.files[file], `Stale or mixed build: ${file}`);
  if (checkSources) assert.equal(await sourceFingerprint(root), build.sourceHash, 'Source differs from dist; rebuild before publishing');
  return build;
}
