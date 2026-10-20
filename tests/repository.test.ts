import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, mkdir, readdir, symlink } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { ArchitectureRepository, validateLayout } from '../src/host/repository';
const md = '# Empty project\nRequirements only.\n\n## 1 Design\n<!-- archside: {"id":"design","status":"planned"} -->\nNo implementation yet.\n';
async function fixture(run: (repo: ArchitectureRepository, root: string) => Promise<void>) {
  const root = await mkdtemp(path.join(tmpdir(), 'archside-test-')); const repo = new ArchitectureRepository();
  try { await run(repo, root); } finally { repo.close(); await rm(root, { recursive: true, force: true }); }
}
test('design-only workspace supports publishing, stable IDs and independent persisted layout', async () => fixture(async (repo, root) => {
  const initial = await repo.snapshot(root); assert.equal(initial.architecture, null);
  const saved = await repo.publish(root, md, '', 'architecture', '仅更新架构设计');
  assert.equal(saved.architecture?.nodes[0].status, 'planned');
  const before = await readFile(path.join(root, 'architecture.md'), 'utf8');
  await repo.saveLayout(root, { version: 1, views: { 'overview:simple': { positions: { design: { x: 140, y: 80 } } } } });
  assert.equal(await readFile(path.join(root, 'architecture.md'), 'utf8'), before);
  const reopened = new ArchitectureRepository();
  try { assert.equal((await reopened.snapshot(root)).layout.views['overview:simple'].positions.design.x, 140); } finally { reopened.close(); }
}));
test('compare-and-swap prevents concurrent tasks from overwriting each other and retains history', async () => fixture(async (repo, root) => {
  const saved = await repo.publish(root, md, '', 'architecture', 'initial');
  const results = await Promise.allSettled([
    repo.publish(root, md.replace('Design', 'First'), saved.revision, 'architecture', 'first'),
    repo.publish(root, md.replace('Design', 'Second'), saved.revision, 'architecture', 'second'),
  ]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await readdir(path.join(root, '.archside/history'))).length, 1);
  await assert.rejects(repo.publish(root, md, saved.revision, 'architecture', 'stale'), /已被其他任务修改/);
}));
test('invalid MD leaves the previous graph and file untouched', async () => fixture(async (repo, root) => {
  const saved = await repo.publish(root, md, '', 'architecture', 'initial');
  await assert.rejects(repo.publish(root, '# no nodes', saved.revision, 'architecture', 'bad'), /未发现节点/);
  assert.equal((await repo.snapshot(root)).revision, saved.revision);
  await writeFile(path.join(root, 'architecture.md'), '# broken');
  const snap = await repo.snapshot(root); assert.equal(snap.architecture?.nodes[0].id, 'design'); assert.match(snap.error!, /解析失败/);
}));
test('task activity defers file reload until every active session completes', async () => fixture(async (repo, root) => {
  await repo.publish(root, md, '', 'architecture', 'initial');
  await repo.setBusy(root, 'a', true); await repo.setBusy(root, 'b', true);
  await writeFile(path.join(root, 'architecture.md'), md.replace('Design', 'Updated'));
  assert.equal((await repo.snapshot(root)).architecture?.nodes[0].title, 'Design');
  await repo.setBusy(root, 'a', false); assert.equal((await repo.snapshot(root)).busy, true);
  await repo.setBusy(root, 'b', false); assert.equal((await repo.snapshot(root)).architecture?.nodes[0].title, 'Updated');
}));

test('publishing during a task freezes the panel while Agent reads the latest revision', async () => fixture(async (repo, root) => {
  const saved = await repo.publish(root, md, '', 'architecture', 'initial');
  await repo.setBusy(root, 'a', true);
  const updated = await repo.publish(root, md.replace('Design', 'Updated'), saved.revision, 'architecture', 'updated');
  assert.equal((await repo.snapshot(root)).architecture?.nodes[0].title, 'Design');
  assert.equal((await repo.snapshot(root, true)).revision, updated.revision);
  await repo.setBusy(root, 'a', false);
  const visible = await repo.snapshot(root);
  assert.equal(visible.architecture?.nodes[0].title, 'Updated');
  assert.equal(visible.notice?.text, 'updated'); assert.equal(visible.busy, false);
}));

test('a task starting before the first panel snapshot still loads an existing architecture', async () => fixture(async (repo, root) => {
  await writeFile(path.join(root, 'architecture.md'), md);
  await repo.setBusy(root, 'a', true);
  assert.equal((await repo.snapshot(root)).architecture?.nodes[0].id, 'design');
  await writeFile(path.join(root, 'architecture.md'), md.replace('Design', 'External'));
  assert.equal((await repo.snapshot(root, true)).architecture?.nodes[0].title, 'External');
  assert.equal((await repo.snapshot(root)).architecture?.nodes[0].title, 'Design');
}));
test('workspace file operations reject traversal and escaping directory links', async () => fixture(async (repo, root) => {
  await assert.rejects(repo.safePath(root, '../outside.png'), /不在当前项目/);
  await assert.rejects(repo.safePath(root, path.resolve(root, '../outside.png')), /相对路径/);
  const outside = await mkdtemp(path.join(tmpdir(), 'archside-outside-'));
  try { await symlink(outside, path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir'); await assert.rejects(repo.safePath(root, 'linked/image.png'), /符号链接/); }
  finally { await rm(path.join(root, 'linked'), { force: true, recursive: true }); await rm(outside, { force: true, recursive: true }); }
}));
test('rejects poisoned or invalid layout values', () => {
  assert.throws(() => validateLayout({ version: 1, views: { a: { positions: { x: { x: Infinity, y: 3 } } } } }), /坐标/);
  assert.throws(() => validateLayout({ version: 1, views: { a: { positions: {}, viewport: { x: 0, y: 0, zoom: 100 } } } }), /缩放/);
});

test('simultaneous first panel requests all receive the saved layout', async () => fixture(async (repo, root) => {
  await mkdir(path.join(root, '.archside'));
  const layout = { version: 1, views: { 'overview:simple': { positions: { design: { x: 125, y: 88 } } } } };
  await writeFile(path.join(root, '.archside/layout.json'), JSON.stringify(layout));
  const snapshots = await Promise.all(Array.from({ length: 8 }, () => repo.snapshot(root)));
  for (const snap of snapshots) assert.deepEqual(snap.layout, layout);
}));
