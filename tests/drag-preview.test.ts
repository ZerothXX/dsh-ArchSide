import test from 'node:test';
import assert from 'node:assert/strict';
import { previewRoute } from '../src/client/drag-preview';
import type { Route } from '../src/core/edge-routing';

test('drag preview keeps moved endpoints attached and every segment orthogonal, including loops', () => {
  const cases = [
    [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 120 }, { x: 160, y: 120 }],
    [{ x: 50, y: 20 }, { x: 100, y: 20 }, { x: 100, y: 90 }, { x: 30, y: 90 }, { x: 30, y: 70 }],
  ];
  for (const points of cases) for (const [source, target] of [[true, false], [false, true], [true, true]]) {
    const route: Route = { points, d: '', label: { x: 0, y: 0 }, labelWidth: 10 };
    const before = structuredClone(route);
    const path = previewRoute(route, { x: 17, y: -29 }, source, target);
    const result = [...path.matchAll(/[ML] ([-\d.]+) ([-\d.]+)/g)].map(m => ({ x: +m[1], y: +m[2] }));
    assert.deepEqual(result[0], { x: points[0].x + (source ? 17 : 0), y: points[0].y - (source ? 29 : 0) });
    assert.deepEqual(result.at(-1), { x: points.at(-1)!.x + (target ? 17 : 0), y: points.at(-1)!.y - (target ? 29 : 0) });
    assert.ok(result.slice(1).every((p, i) => p.x === result[i].x || p.y === result[i].y));
    assert.deepEqual(route, before, 'preview must not mutate the finalized route');
  }
});
