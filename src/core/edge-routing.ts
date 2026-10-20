import type { Point } from './model';

interface Card { id: string; x: number; y: number; width: number; height: number }
interface Edge { id: string; source: string; target: string; label: string; structural?: string }
interface Rect { x: number; y: number; width: number; height: number }
interface Port { point: Point; exit: Point; direction: number; preference: number }
export interface Route { d: string; points: Point[]; label: Point; labelWidth: number }

const distance = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const center = (n: Card) => ({ x: n.x + n.width / 2, y: n.y + n.height / 2 });
const inflate = (n: Rect, gap: number): Rect => ({ x: n.x - gap, y: n.y - gap, width: n.width + 2 * gap, height: n.height + 2 * gap });
const contains = (r: Rect, p: Point) => p.x > r.x && p.x < r.x + r.width && p.y > r.y && p.y < r.y + r.height;
function blocked(a: Point, b: Point, r: Rect) {
  return a.x === b.x
    ? a.x > r.x && a.x < r.x + r.width && Math.max(a.y, b.y) > r.y && Math.min(a.y, b.y) < r.y + r.height
    : a.y > r.y && a.y < r.y + r.height && Math.max(a.x, b.x) > r.x && Math.min(a.x, b.x) < r.x + r.width;
}
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

/** Route all relationships together, avoiding cards and penalizing occupied channels. */
export function routeEdges(nodes: Card[], edges: Edge[]): Map<string, Route> {
  const routes = new Map<string, Route>();
  if (!nodes.length || !edges.length) return routes;
  const byId = new Map(nodes.map(n => [n.id, n]));
  const valid = edges.filter(e => byId.has(e.source) && byId.has(e.target));
  const obstacles = nodes.map(n => inflate(n, 12));
  const neighbors = new Map<string, Edge[]>();
  for (const edge of valid) for (const id of new Set([edge.source, edge.target])) {
    const list = neighbors.get(id) ?? []; list.push(edge); neighbors.set(id, list);
  }
  const fractions = new Map<string, Map<string, Point>>();
  for (const [id, list] of neighbors) {
    const ranks = new Map<string, Point>();
    for (const axis of ['x', 'y'] as const) {
      const peer = (e: Edge) => byId.get(e.source === id ? e.target : e.source)!;
      const sorted = [...list].sort((a, b) => center(peer(a))[axis] - center(peer(b))[axis] || a.id.localeCompare(b.id));
      sorted.forEach((e, i) => {
        const rank = ranks.get(e.id) ?? { x: 0, y: 0 };
        rank[axis] = .22 + .56 * (i + 1) / (list.length + 1); ranks.set(e.id, rank);
      });
    }
    fractions.set(id, ranks);
  }
  const ports = (n: Card, other: Card, edge: Edge): Port[] => {
    const fraction = fractions.get(n.id)!.get(edge.id)!;
    const x = Math.round(n.x + n.width * fraction.x), y = Math.round(n.y + n.height * fraction.y);
    const c = center(n), o = center(other), dx = o.x - c.x, dy = o.y - c.y;
    return [
      { point: { x: n.x + n.width, y }, exit: { x: n.x + n.width + 22, y }, direction: 1, preference: dx >= 0 ? 0 : 90 },
      { point: { x: n.x, y }, exit: { x: n.x - 22, y }, direction: 1, preference: dx <= 0 ? 0 : 90 },
      { point: { x, y: n.y + n.height }, exit: { x, y: n.y + n.height + 22 }, direction: 2, preference: dy >= 0 ? 0 : 90 },
      { point: { x, y: n.y }, exit: { x, y: n.y - 22 }, direction: 2, preference: dy <= 0 ? 0 : 90 },
    ];
  };
  const endpoints = valid.map(e => {
    const from = ports(byId.get(e.source)!, byId.get(e.target)!, e), to = ports(byId.get(e.target)!, byId.get(e.source)!, e);
    // Collapsed internal relationships remain visible as separate loops.
    return { edge: e, from: e.source === e.target ? [from[0]] : from, to: e.source === e.target ? [to[2]] : to };
  });
  const xs = new Set<number>(), ys = new Set<number>();
  for (const n of nodes) {
    xs.add(n.x - 30); xs.add(n.x + n.width + 30);
    ys.add(n.y - 30); ys.add(n.y + n.height + 30);
  }
  for (const e of endpoints) for (const p of [...e.from, ...e.to]) { xs.add(p.exit.x); ys.add(p.exit.y); }
  const xValues = [...xs].sort((a, b) => a - b), yValues = [...ys].sort((a, b) => a - b);
  const width = xValues.length, points = yValues.flatMap(y => xValues.map(x => ({ x, y })));
  const xIndex = new Map(xValues.map((x, i) => [x, i])), yIndex = new Map(yValues.map((y, i) => [y, i]));
  const index = (p: Point) => yIndex.get(p.y)! * width + xIndex.get(p.x)!;
  const free = points.map(p => !obstacles.some(r => contains(r, p)));
  const adjacent = points.map((p, i) => {
    if (!free[i]) return [];
    const next = [i % width ? i - 1 : -1, i % width < width - 1 ? i + 1 : -1, i - width, i + width];
    return next.filter(j => j >= 0 && j < points.length && free[j] && !obstacles.some(r => blocked(p, points[j], r)));
  });
  const occupied: [Point, Point][] = [], labels: Rect[] = [];
  // Short relationships take the direct channels; longer dependencies go around them.
  endpoints.sort((a, b) => Number(!!a.edge.structural) - Number(!!b.edge.structural)
    || distance(center(byId.get(a.edge.source)!), center(byId.get(a.edge.target)!)) - distance(center(byId.get(b.edge.source)!), center(byId.get(b.edge.target)!)) || a.edge.id.localeCompare(b.edge.id));
  for (const { edge, from, to } of endpoints) {
    const goals = new Map(to.filter(p => free[index(p.exit)]).map(p => [index(p.exit) * 3 + p.direction, p]));
    const costs = new Map<number, number>(), previous = new Map<number, number>();
    const starts = new Map<number, Port>(), queue = new MinHeap();
    const heuristic = (p: Point) => Math.min(...to.map(t => distance(p, t.exit)));
    for (const p of from) {
      const i = index(p.exit); if (!free[i]) continue;
      const key = i * 3 + p.direction, cost = p.preference;
      costs.set(key, cost); starts.set(key, p); queue.push(key, cost + heuristic(p.exit));
    }
    let goal: number | undefined, best = Infinity;
    while (queue.size) {
      const item = queue.pop()!;
      if (item.cost >= best) break;
      const key = item.key, i = Math.floor(key / 3), direction = key % 3;
      const cost = costs.get(key)!;
      if (item.cost > cost + heuristic(points[i]) + .01) continue;
      const target = goals.get(key);
      if (target && cost + target.preference < best) { best = cost + target.preference; goal = key; }
      for (const j of adjacent[i]) {
        const a = points[i], b = points[j], dir = a.y === b.y ? 1 : 2;
        const penalty = occupied.reduce((sum, [c, d]) => {
          if (a.y === b.y && c.y === d.y && a.y === c.y) return sum + Math.max(0, Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) - Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x))) * 1.8;
          if (a.x === b.x && c.x === d.x && a.x === c.x) return sum + Math.max(0, Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) - Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y))) * 1.8;
          const h = a.y === b.y ? [a, b] : [c, d], v = a.y === b.y ? [c, d] : [a, b];
          return sum + (h[0].y >= Math.min(v[0].y, v[1].y) && h[0].y <= Math.max(v[0].y, v[1].y) && v[0].x >= Math.min(h[0].x, h[1].x) && v[0].x <= Math.max(h[0].x, h[1].x) ? 40 : 0);
        }, 0);
        const nextCost = cost + distance(a, b) + (direction === dir ? 0 : 28) + penalty;
        const next = j * 3 + dir;
        if (nextCost < (costs.get(next) ?? Infinity)) {
          costs.set(next, nextCost); previous.set(next, key); queue.push(next, nextCost + heuristic(b));
        }
      }
    }
    // Overlapping user-dragged cards can cover all ports; keep a visible fallback.
    let path: Point[];
    if (goal !== undefined) {
      const keys = [goal]; while (previous.has(keys[0])) keys.unshift(previous.get(keys[0])!);
      path = [starts.get(keys[0])!.point, ...keys.map(k => points[Math.floor(k / 3)]), goals.get(goal)!.point];
    } else {
      const a = from[0].point, b = to[Math.min(1, to.length - 1)].point;
      path = [a, { x: (a.x + b.x) / 2, y: a.y }, { x: (a.x + b.x) / 2, y: b.y }, b];
    }
    path = simplify(path);
    const labelWidth = Math.max(16, [...edge.label].reduce((sum, c) => sum + (c.charCodeAt(0) > 255 ? 10 : 6), 12));
    const candidates: { p: Point; rect: Rect; score: number }[] = [];
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], horizontal = a.y === b.y, length = distance(a, b);
      for (const ratio of [.5, .3, .7]) for (const side of [-1, 1]) {
        const p = { x: a.x + (b.x - a.x) * ratio + (horizontal ? 0 : side * (labelWidth / 2 + 8)), y: a.y + (b.y - a.y) * ratio + (horizontal ? side * 12 : 0) };
        const rect = { x: p.x - labelWidth / 2, y: p.y - 10, width: labelWidth, height: 18 };
        const conflicts = nodes.filter(n => overlaps(rect, inflate(n, 5))).length + labels.filter(r => overlaps(rect, inflate(r, 4))).length;
        candidates.push({ p, rect, score: conflicts * 100000 + (horizontal ? Math.max(0, labelWidth - length) * 10 : 30) + Math.abs(ratio - .5) * 20 - Math.min(length, 260) * .05 });
      }
      occupied.push([a, b]);
    }
    candidates.sort((a, b) => a.score - b.score);
    const label = candidates[0]?.p ?? path[0];
    if (edge.label && candidates[0]) labels.push(candidates[0].rect);
    routes.set(edge.id, { d: rounded(path), points: path, label, labelWidth });
  }
  return routes;
}

function simplify(points: Point[]) {
  const result: Point[] = [];
  for (const p of points) {
    if (result.length && distance(result.at(-1)!, p) < .01) continue;
    while (result.length > 1) {
      const a = result.at(-2)!, b = result.at(-1)!;
      if ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y)) result.pop(); else break;
    }
    result.push(p);
  }
  return result;
}
function rounded(points: Point[]) {
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1], b = points[i], c = points[i + 1], radius = Math.min(8, distance(a, b) / 2, distance(b, c) / 2);
    const before = { x: b.x + Math.sign(a.x - b.x) * radius, y: b.y + Math.sign(a.y - b.y) * radius };
    const after = { x: b.x + Math.sign(c.x - b.x) * radius, y: b.y + Math.sign(c.y - b.y) * radius };
    d += ` L ${before.x} ${before.y} Q ${b.x} ${b.y} ${after.x} ${after.y}`;
  }
  const end = points.at(-1)!; return d + ` L ${end.x} ${end.y}`;
}
class MinHeap {
  private items: { key: number; cost: number }[] = [];
  get size() { return this.items.length; }
  push(key: number, cost: number) {
    const item = { key, cost }; this.items.push(item); let i = this.items.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (this.items[p].cost <= cost) break; this.items[i] = this.items[p]; i = p; }
    this.items[i] = item;
  }
  pop() {
    const first = this.items[0], last = this.items.pop()!; if (!this.items.length) return first;
    let i = 0;
    while (i * 2 + 1 < this.items.length) {
      let child = i * 2 + 1;
      if (child + 1 < this.items.length && this.items[child + 1].cost < this.items[child].cost) child++;
      if (this.items[child].cost >= last.cost) break;
      this.items[i] = this.items[child]; i = child;
    }
    this.items[i] = last; return first;
  }
}
