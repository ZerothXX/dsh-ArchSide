import test from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE } from '../src/core/model';
import { parseMarkdown, serializeMarkdown } from '../src/core/markdown';

type Link = [number, number, number?];
function fixture(count: number, links: Link[] = [], preferred?: string[], order = Array.from({ length: count }, (_, i) => i)) {
  const chapters = order.map(i => `## ${i + 1} Chapter ${i}\n<!-- archside: ${JSON.stringify({ id: `chapter-${i}`, ...(preferred ? { color: preferred[i] } : {}) })} -->\n### ${i + 1}.1 Section\n<!-- archside: {"id":"section-${i}","color":"rose"} -->\n#### ${i + 1}.1.1 Leaf\n<!-- archside: {"id":"leaf-${i}"} -->\n`).join('\n');
  const edges = links.flatMap(([a, b, weight = 1], i) => Array.from({ length: weight }, (_, j) => ({
    id: `edge-${i}-${j}`, source: `leaf-${a}`, target: `section-${b}`, kind: 'data', label: '',
  })));
  return `# Chapter color test\n${chapters}\n\`\`\`archside\n${JSON.stringify({ version: 1, edges })}\n\`\`\`\n`;
}
function colorMap(markdown: string) {
  return new Map(parseMarkdown(markdown).nodes.filter(n => n.depth === 1).map(n => [n.id, n.color]));
}
function complete(count: number, weight = 1): Link[] {
  return Array.from({ length: count }, (_, a) => Array.from({ length: count - a - 1 }, (_, i) => [a, a + i + 1, weight] as Link)).flat();
}

test('eight chapter colors are available, explicit duplicates are repaired and descendants inherit chapter colors', () => {
  assert.equal(PALETTE.length, 8);
  assert.equal(new Set(PALETTE.map(p => p.id)).size, 8);
  assert.equal(new Set(PALETTE.map(p => p.ink)).size, 8);
  const doc = parseMarkdown(fixture(8, [], Array(8).fill('blue')));
  const chapters = new Map(doc.nodes.filter(n => n.depth === 1).map(n => [n.id, n.color]));
  assert.equal(new Set(chapters.values()).size, 8);
  for (const node of doc.nodes) assert.equal(node.color, chapters.get(node.chapterId));
  assert.deepEqual(parseMarkdown(serializeMarkdown(doc)), doc);
});

test('nine chapters reuse a color on the only disconnected pair rather than on connected chapters', () => {
  const links = complete(9).filter(([a, b]) => !(a === 0 && b === 8));
  const colors = colorMap(fixture(9, links));
  assert.equal(new Set(colors.values()).size, 8);
  assert.equal(colors.get('chapter-0'), colors.get('chapter-8'));
  for (const [a, b] of links) assert.notEqual(colors.get(`chapter-${a}`), colors.get(`chapter-${b}`));
});

test('dense graphs replace an existing strong same-color pair with the weakest pair, counting both directions', () => {
  const preferred = ['blue', 'blue', 'purple', 'teal', 'orange', 'slate', 'rose', 'olive', 'brown'];
  const links = complete(9, 4).map(([a, b, weight]) => [a, b, a === 5 && b === 6 ? 1 : weight] as Link);
  links.push([6, 5, 1], [5, 5, 30]); // Reverse relations count; within-chapter relations do not.
  const md = fixture(9, links, preferred);
  const doc = parseMarkdown(md); const colors = new Map(doc.nodes.map(n => [n.id, n.color]));
  assert.equal(new Set(doc.nodes.filter(n => n.depth === 1).map(n => n.color)).size, 8);
  assert.equal(colors.get('chapter-5'), colors.get('chapter-6'));
  assert.notEqual(colors.get('chapter-0'), colors.get('chapter-1'));
  assert.equal(doc.edges.length, links.reduce((sum, [, , count = 1]) => sum + count, 0));
  assert.deepEqual(parseMarkdown(serializeMarkdown(doc)), doc);
});

test('disconnected chapters beyond eight use all eight colors with balanced reuse', () => {
  const colors = colorMap(fixture(17));
  const counts = PALETTE.map(p => [...colors.values()].filter(color => color === p.id).length);
  assert.equal(new Set(colors.values()).size, 8);
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
});

test('sixteen bipartite chapters reuse colors without assigning the same color across a connection', () => {
  const links: Link[] = [];
  for (let a = 0; a < 8; a++) for (let b = 8; b < 16; b++) links.push([a, b]);
  const colors = colorMap(fixture(16, links));
  assert.equal(new Set(colors.values()).size, 8);
  for (const [a, b] of links) assert.notEqual(colors.get(`chapter-${a}`), colors.get(`chapter-${b}`));
});

test('chapter IDs keep colors deterministic across heading order, edge order and Markdown round trips', () => {
  const links = complete(10).filter(([a, b]) => (a + b) % 3 !== 0);
  const original = parseMarkdown(fixture(10, links));
  const expected = Object.fromEntries(original.nodes.filter(n => n.depth === 1).map(n => [n.id, n.color]));
  const reordered = colorMap(fixture(10, [...links].reverse(), undefined, Array.from({ length: 10 }, (_, i) => 9 - i)));
  assert.deepEqual(Object.fromEntries(reordered), expected);
  assert.deepEqual(parseMarkdown(serializeMarkdown(original)), original);
  const renamed = parseMarkdown(serializeMarkdown(original).replaceAll('Chapter', 'Renamed chapter'));
  assert.deepEqual(Object.fromEntries(renamed.nodes.filter(n => n.depth === 1).map(n => [n.id, n.color])), expected);
});
