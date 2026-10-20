import type { Point } from '../core/model';
import type { Route } from '../core/edge-routing';

/** Move connected endpoints only; global obstacle routing runs once after release. */
export function previewRoute(route: Route, delta: Point, source: boolean, target: boolean): string {
  let points = route.points.map(p => ({ ...p }));
  const last = points.length - 1;
  if (source) {
    points[0].x += delta.x; points[0].y += delta.y;
    if (last > 1) {
      if (route.points[0].y === route.points[1].y) points[1].y += delta.y;
      else points[1].x += delta.x;
    }
  }
  if (target) {
    points[last].x += delta.x; points[last].y += delta.y;
    if (last > 1) {
      if (route.points[last].y === route.points[last - 1].y) points[last - 1].y += delta.y;
      else points[last - 1].x += delta.x;
    }
  }
  // Short routes need an extra elbow when one endpoint leaves its original row.
  const orthogonal: Point[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = orthogonal.at(-1)!, b = points[i];
    if (a.x !== b.x && a.y !== b.y) orthogonal.push({ x: b.x, y: a.y });
    orthogonal.push(b);
  }
  return orthogonal.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ');
}
