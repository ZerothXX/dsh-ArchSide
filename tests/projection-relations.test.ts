import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseMarkdown } from '../src/core/markdown';
import { project } from '../src/core/projection';

const layout = { version: 1 as const, views: {} };
const doc = parseMarkdown(readFileSync('examples/architecture.md', 'utf8'));

test('both overview modes preserve every original relationship, including collapsed internal edges', () => {
  const before = structuredClone(doc);
  for (const detailed of [false, true]) {
    const graph = project(doc, null, detailed, new Set(), layout);
    const explicit = graph.edges.filter(e => !e.structural);
    assert.deepEqual(new Set(explicit.map(e => e.originalId)), new Set(doc.edges.map(e => e.id)));
    assert.equal(explicit.length, doc.edges.length);
    assert.ok(explicit.some(e => e.source === e.target));
    assert.equal(graph.routes.size, graph.edges.length);
    for (const e of explicit.filter(e => e.source === e.target)) {
      const route = graph.routes.get(e.id)!;
      assert.ok(route.points.length >= 4);
      assert.notDeepEqual(route.points[0], route.points.at(-1));
    }
  }
  assert.deepEqual(doc, before, 'projection must not modify architecture data');
});

test('parallel and chapter-level relationships retain individual identities through projection', () => {
  const synthetic = parseMarkdown('# Test\n## 1 A\n<!-- archside: {"id":"a"} -->\n### 1.1 First\n<!-- archside: {"id":"first"} -->\n### 1.2 Second\n<!-- archside: {"id":"second"} -->\n## 2 B\n<!-- archside: {"id":"b"} -->\n### 2.1 Other\n<!-- archside: {"id":"other"} -->\n```archside\n{"edges":[{"id":"e1","source":"first","target":"other","label":"One"},{"id":"e2","source":"first","target":"other","label":"Two"},{"id":"chapter","source":"a","target":"b","label":"Module dependency"}]}\n```');
  const graph = project(synthetic, null, true, new Set(), layout);
  assert.equal(graph.edges.filter(e => e.originalId === 'e1').length, 1);
  assert.equal(graph.edges.filter(e => e.originalId === 'e2').length, 1);
  const chapterEdges = graph.edges.filter(e => e.originalId === 'chapter');
  assert.equal(chapterEdges.length, 2);
  assert.ok(chapterEdges.every(e => e.projected && e.label.startsWith('章级关系')));
  assert.equal(new Set(graph.edges.map(e => e.id)).size, graph.edges.length);
  assert.equal(graph.routes.size, graph.edges.length);
});

test('heading membership is visible without pretending that siblings exchange data', () => {
  const graph = project(doc, 'persistence', false, new Set(), layout);
  assert.ok(graph.edges.some(e => e.structural === 'parent-child' && e.source === 'sync' && e.target === 'revision-control'));
  assert.ok(graph.edges.some(e => e.structural === 'same-parent' && e.source === 'sync' && e.target === 'dsh-integration'));
  const overview = project(doc, null, true, new Set(), layout);
  assert.ok(overview.edges.some(e => e.structural === 'same-parent' && e.target === 'dsh-integration'));
  const unrelated = parseMarkdown('# Test\n## 1 A\n### 1.1 Only A\n## 2 B\n### 2.1 Only B\n');
  assert.equal(project(unrelated, null, true, new Set(), layout).edges.length, 0, 'do not invent a relation between unrelated chapters');
});
