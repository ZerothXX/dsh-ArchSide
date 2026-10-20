import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { routeEdges } from '../src/core/edge-routing';
import { parseMarkdown } from '../src/core/markdown';
import { project } from '../src/core/projection';

const doc = parseMarkdown(readFileSync('examples/architecture.md', 'utf8'));
function crosses(a: { x: number; y: number }, b: { x: number; y: number }, n: { x: number; y: number; width: number; height: number }) {
  return a.x === b.x
    ? a.x > n.x + .01 && a.x < n.x + n.width - .01 && Math.max(a.y, b.y) > n.y + .01 && Math.min(a.y, b.y) < n.y + n.height - .01
    : a.y > n.y + .01 && a.y < n.y + n.height - .01 && Math.max(a.x, b.x) > n.x + .01 && Math.min(a.x, b.x) < n.x + n.width - .01;
}
test('routes avoid intervening cards and fan out cycles from distinct ports', () => {
  const cards = [
    { id: 'a', x: 60, y: 90, width: 228, height: 56 },
    { id: 'block', x: 380, y: 45, width: 228, height: 187 },
    { id: 'b', x: 700, y: 90, width: 228, height: 56 },
  ];
  const edges = [
    { id: 'ab', source: 'a', target: 'b', label: 'Forward' },
    { id: 'ba', source: 'b', target: 'a', label: 'Feedback' },
  ];
  const routes = routeEdges(cards, edges);
  assert.equal(routes.size, 2);
  assert.deepEqual(routeEdges(cards, edges), routes);
  for (const route of routes.values()) for (let i = 1; i < route.points.length; i++) {
    const [a, b] = [route.points[i - 1], route.points[i]];
    assert.ok(a.x === b.x || a.y === b.y);
    assert.ok(cards.every(n => !crosses(a, b, n)), 'relationship must not cross a card');
  }
  assert.notDeepEqual(routes.get('ab')!.points[0], routes.get('ba')!.points.at(-1));
});
test('real overview and expanded chapter routes keep relationships and labels off cards', () => {
  for (const chapter of [null, 'structure']) for (const expanded of [new Set<string>(), new Set(doc.nodes.map(n => n.id))]) {
    const graph = project(doc, chapter, true, expanded, { version: 1, views: {} });
    assert.equal(graph.routes.size, graph.edges.length);
    for (const [id, route] of graph.routes) {
      for (let i = 1; i < route.points.length; i++) {
        assert.ok(graph.nodes.every(n => !crosses(route.points[i - 1], route.points[i], n)), `${id} intersects a card`);
      }
      const rect = { x: route.label.x - route.labelWidth / 2, y: route.label.y - 9, width: route.labelWidth, height: 17 };
      assert.ok(graph.nodes.every(n => rect.x + rect.width <= n.x || n.x + n.width <= rect.x || rect.y + rect.height <= n.y || n.y + n.height <= rect.y), `${id} label overlaps a card`);
    }
  }
});

test('collapsed relationships remain visible when overlapping cards cover loop ports', () => {
  const routes = routeEdges([
    { id: 'a', x: 60, y: 90, width: 228, height: 56 },
    { id: 'cover', x: 50, y: 80, width: 300, height: 150 },
  ], [{ id: 'internal', source: 'a', target: 'a', label: 'Internal relation' }]);
  const route = routes.get('internal')!;
  assert.ok(route.d.length > 0);
  assert.ok(route.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
  assert.notDeepEqual(route.points[0], route.points.at(-1));
});
