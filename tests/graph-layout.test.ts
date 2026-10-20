import test from 'node:test';
import assert from 'node:assert/strict';
import { arrange } from '../src/core/graph-layout';
import { parseMarkdown } from '../src/core/markdown';
import { project } from '../src/core/projection';

test('cross-chapter relationships determine placement without chapter partitions', () => {
  const doc = parseMarkdown('# Test\n## 1 A\n<!-- archside: {"id":"a"} -->\n### 1.1 Input\n<!-- archside: {"id":"input"} -->\n### 1.2 Output\n<!-- archside: {"id":"output"} -->\n## 2 B\n<!-- archside: {"id":"b"} -->\n### 2.1 Process\n<!-- archside: {"id":"process"} -->\n```archside\n{"edges":[{"id":"e1","source":"input","target":"process","kind":"data","label":""},{"id":"e2","source":"process","target":"output","kind":"data","label":""}]}\n```');
  const graph = project(doc, null, true, new Set(), { version: 1, views: {} });
  const node = (id: string) => graph.nodes.find(n => n.id === id)!;
  assert.deepEqual(graph.nodes.map(n => n.id), ['input', 'output', 'process']);
  const alternate = project({ ...doc, edges: [] }, null, true, new Set(), { version: 1, views: {} });
  assert.notDeepEqual(graph.nodes.map(n => [n.x, n.y]), alternate.nodes.map(n => [n.x, n.y]));
  assert.equal(node('input').color, node('output').color);
  const chapter = project(doc, 'a', false, new Set(), { version: 1, views: {} });
  assert.deepEqual(chapter.nodes.map(n => n.id), ['input', 'output', 'process']);
  assert.ok(chapter.nodes.find(n => n.id === 'process')?.external);
  assert.ok(chapter.edges.every(e => chapter.nodes.some(n => n.id === e.source) && chapter.nodes.some(n => n.id === e.target)));
  const saved = project(doc, null, true, new Set(), { version: 1, views: { 'overview:detailed': { positions: { input: { x: 1200, y: 700 } } } } });
  assert.equal(saved.nodes.find(n => n.id === 'input')!.x, 1200);
  assert.equal(saved.nodes.find(n => n.id === 'input')!.y, 700);
});

test('layout handles cycles, disconnected nodes and expanded card sizes without overlapping', () => {
  const nodes = ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({ id, x: 0, y: 0, width: 228, height: i % 2 ? 187 : 56 }));
  const links = [{ source: 'a', target: 'b' }, { source: 'b', target: 'a' }, { source: 'b', target: 'c' }, { source: 'd', target: 'e' }];
  arrange(nodes, links);
  assert.ok(nodes.every(n => Number.isFinite(n.x) && Number.isFinite(n.y)));
  for (const a of nodes) for (const b of nodes) if (a !== b) {
    assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
  }
  const previous = structuredClone(nodes); arrange(nodes, links); assert.deepEqual(nodes, previous);
  assert.doesNotThrow(() => arrange([], []));
});

test('chapter cohesion survives dense cross-chapter dependencies without confining dragged positions', () => {
  const nodes = Array.from({ length: 9 }, (_, i) => ({ id: `n${i}`, chapterId: `c${Math.floor(i / 3)}`, x: 0, y: 0, width: 228, height: 56 }));
  const links = nodes.flatMap((n, i) => nodes.filter((m, j) => j > i && n.chapterId !== m.chapterId).map(m => ({ source: n.id, target: m.id })));
  arrange(nodes, links);
  const within: number[] = [], between: number[] = [];
  for (const a of nodes) for (const b of nodes) if (a !== b) {
    (a.chapterId === b.chapterId ? within : between).push(Math.hypot(a.x - b.x, a.y - b.y));
  }
  const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
  assert.ok(mean(within) < mean(between) * .7, 'same-chapter nodes should remain nearby');
});
