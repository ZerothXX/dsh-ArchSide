import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('delivery integrity rejects a changed manifest, stale bundle or newer source even when a build exists', async () => {
  const { writeBuildManifest, verifyBuild } = await import(new URL('../scripts/build-integrity.mjs', import.meta.url).href);
  const root = await mkdtemp(join(tmpdir(), 'archside-integrity-'));
  try {
    for (const dir of ['src', 'scripts', 'dist']) await mkdir(join(root, dir));
    const files: Record<string, string> = {
      'package.json': JSON.stringify({ version: '0.1.9' }), 'package-lock.json': '{}', 'tsconfig.json': '{}',
      'scripts/build.mjs': '// builder', 'scripts/build-integrity.mjs': '// verifier', 'src/model.ts': '// eight colors',
      ...Object.fromEntries(['host.js', 'host.js.map', 'client.js', 'preview.js', 'index.html'].map(file => [`dist/${file}`, 'current build'])),
    };
    for (const [file, content] of Object.entries(files)) await writeFile(join(root, file), content);
    await writeBuildManifest(root); await verifyBuild(root); await verifyBuild(root, false);
    await writeFile(join(root, 'package.json'), JSON.stringify({ version: '0.2.0' }));
    await assert.rejects(verifyBuild(root), /Build version differs/);
    await writeFile(join(root, 'package.json'), files['package.json']);
    await writeFile(join(root, 'dist/host.js'), 'old five-color build');
    await assert.rejects(verifyBuild(root), /Stale or mixed build: host.js/);
    await writeFile(join(root, 'dist/host.js'), files['dist/host.js']);
    await writeFile(join(root, 'src/model.ts'), '// changed allocator');
    await assert.rejects(verifyBuild(root), /Source differs from dist/);
    await writeFile(join(root, 'src/model.ts'), files['src/model.ts']);
    await writeFile(join(root, 'src/extra.ts'), '// new source');
    await assert.rejects(verifyBuild(root), /Source differs from dist/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
