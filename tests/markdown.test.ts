import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseMarkdown, serializeMarkdown } from '../src/core/markdown';
import { nodeContext } from '../src/core/model';
import { project } from '../src/core/projection';
const example = await readFile(new URL('../examples/architecture.md', import.meta.url), 'utf8');

test('architecture Markdown round trip preserves complete content and stable relationships', () => {
  const doc = parseMarkdown(example);
  assert.deepEqual(parseMarkdown(serializeMarkdown(doc)), doc);
  assert.equal(doc.nodes.filter(n => n.depth === 1).length, 4);
  assert.ok(doc.nodes.some(n => n.body.includes('| 内容层级 |')));
  assert.equal(doc.nodes.find(n => n.id === 'heading-format')?.chapterId, 'structure');
});
test('renaming and renumbering do not reconnect edges by displayed name', () => {
  const before = parseMarkdown(example);
  const after = parseMarkdown(example.replace('## 1 需求与结构', '## 8 结构定义').replaceAll('### 1.', '### 8.').replaceAll('#### 1.', '#### 8.'));
  assert.deepEqual(after.edges, before.edges);
  assert.equal(after.nodes.find(n => n.id === 'markdown')?.number, '8.1');
});
test('fenced examples never create architecture nodes', () => {
  const doc = parseMarkdown('# Test\n## 1 Module\n```md\n### 1.1 Example only\n```\n');
  assert.equal(doc.nodes.length, 1); assert.match(doc.nodes[0].body, /### 1.1/);
});

test('metadata inside code examples is preserved and never replaces node identity', () => {
  const md = '# Test\n## 1 Module\n<!-- archside: {"id":"real"} -->\n```md\n<!-- archside: {"id":"example"} -->\n```\n';
  const doc = parseMarkdown(md);
  assert.equal(doc.nodes[0].id, 'real'); assert.match(doc.nodes[0].body, /"id":"example"/);
  assert.deepEqual(parseMarkdown(serializeMarkdown(doc)), doc);
  assert.throws(() => parseMarkdown(md + '<!-- archside: {"id":"other"} -->'), /元数据重复/);
});

test('rejects multiple relationship blocks and deeper numbered content', () => {
  assert.throws(() => parseMarkdown('# Test\n## 1 Module\n```archside\n{}\n```\n```archside\n{}\n```'), /只能有一个/);
  assert.throws(() => parseMarkdown('# Test\n## 1 Module\n##### 1.1.1.1 Too deep\n'), /三级/);
});
test('rejects dangling edges, duplicate IDs/numbers and missing parents', () => {
  assert.throws(() => parseMarkdown(example.replace('"target":"references"', '"target":"missing"')), /不存在/);
  assert.throws(() => parseMarkdown(example.replace('"id":"mapping"', '"id":"markdown"')), /重复/);
  assert.throws(() => parseMarkdown('# Test\n### 1.1 Missing parent\n'), /父节点/);
  assert.throws(() => parseMarkdown('# Test\n## 1 First\n## 1 Duplicate\n'), /重复/);
});
test('external MD without metadata gains explicit IDs when serialized', () => {
  const doc = parseMarkdown('# Project\nRequirements\n## 1 Inputs\n### 1.1 Images\nImage requirements.\n');
  const saved = serializeMarkdown(doc);
  assert.match(saved, /"id":"node-1-1"/);
  assert.equal(parseMarkdown(saved).nodes[1].id, doc.nodes[1].id);
});
test('view hierarchy aggregates edges and contains direct cross-chapter boundary references', () => {
  const doc = parseMarkdown(example); const layout = { version: 1 as const, views: {} };
  const simple = project(doc, null, false, new Set(), layout);
  assert.equal(simple.nodes.length, 4); assert.ok(simple.edges.length > 0);
  assert.ok(simple.edges.every(e => doc.nodes.find(n => n.id === e.source)?.depth === 1));
  const detail = project(doc, null, true, new Set(), layout);
  assert.ok(detail.nodes.some(n => n.id === 'markdown')); assert.ok(!detail.nodes.some(n => n.depth === 3));
  assert.ok(detail.nodes.every(n => n.depth === 2));
  assert.equal(detail.nodes.length, doc.nodes.filter(n => n.depth === 2).length);
  const chapter = project(doc, 'visualization', false, new Set(), layout);
  assert.ok(chapter.nodes.some(n => n.id === 'projection'));
  assert.ok(chapter.nodes.some(n => n.id === 'references' && n.external));
  assert.ok(!chapter.nodes.some(n => n.id === 'heading-format'));
});
test('node context includes descendants and direct connections without recursive fanout', () => {
  const doc = parseMarkdown(example); const context = nodeContext(doc, ['visualization']);
  assert.ok(context.descendants.some(n => n.id === 'node-actions'));
  assert.ok(context.connected.some(n => n.id === 'references'));
  assert.ok(!context.connected.some(n => n.id === 'revision-control'));
});
