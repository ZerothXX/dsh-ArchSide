interface Card { id: string; chapterId?: string; x: number; y: number; width: number; height: number }
interface Link { source: string; target: string }

/** One shared canvas, with soft chapter cohesion rather than enclosing groups. */
export function arrange(nodes: Card[], links: Link[]) {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const outgoing = new Map(nodes.map(n => [n.id, new Set<string>()]));
  const incoming = new Map(nodes.map(n => [n.id, new Set<string>()]));
  for (const { source, target } of links) {
    if (source === target || !byId.has(source) || !byId.has(target)) continue;
    outgoing.get(source)!.add(target); incoming.get(target)!.add(source);
  }
  // Collapse cycles before ranking, so feedback links cannot grow the canvas forever.
  const visited = new Set<string>(), order: string[] = [];
  for (const n of nodes) {
    if (visited.has(n.id)) continue;
    const stack: [string, boolean][] = [[n.id, false]];
    while (stack.length) {
      const [id, done] = stack.pop()!;
      if (done) { order.push(id); continue; }
      if (visited.has(id)) continue;
      visited.add(id); stack.push([id, true]);
      for (const next of outgoing.get(id)!) if (!visited.has(next)) stack.push([next, false]);
    }
  }
  const component = new Map<string, number>(); let count = 0;
  for (const id of order.reverse()) {
    if (component.has(id)) continue;
    const stack = [id]; component.set(id, count);
    while (stack.length) for (const next of incoming.get(stack.pop()!)!) {
      if (!component.has(next)) { component.set(next, count); stack.push(next); }
    }
    count++;
  }
  const next = Array.from({ length: count }, () => new Set<number>());
  const degree = Array(count).fill(0), rank = Array(count).fill(0);
  for (const [source, targets] of outgoing) for (const target of targets) {
    const a = component.get(source)!, b = component.get(target)!;
    if (a !== b && !next[a].has(b)) { next[a].add(b); degree[b]++; }
  }
  const ready = degree.flatMap((d, i) => d === 0 ? [i] : []);
  for (let i = 0; i < ready.length; i++) for (const target of next[ready[i]]) {
    rank[target] = Math.max(rank[target], rank[ready[i]] + 1);
    if (--degree[target] === 0) ready.push(target);
  }
  const columns: Card[][] = Array.from({ length: Math.max(0, ...rank) + 1 }, () => []);
  for (const n of nodes) columns[rank[component.get(n.id)!]].push(n);
  const height = (column: Card[]) => column.reduce((sum, n) => sum + n.height + 60, -60);
  const totalHeight = Math.max(0, ...columns.map(height));
  const place = (column: Card[]) => {
    let y = 50 + (totalHeight - height(column)) / 2;
    for (const n of column) { n.y = y; y += n.height + 60; }
  };
  columns.forEach(place);
  // Bring directly connected nodes together across chapter colors.
  for (let pass = 0; pass < 6; pass++) {
    const forward = pass % 2 === 0;
    for (const column of forward ? columns : [...columns].reverse()) {
      const score = (n: Card) => {
        const neighbors = [...(forward ? incoming : outgoing).get(n.id)!].map(id => byId.get(id)!);
        return neighbors.length ? neighbors.reduce((sum, p) => sum + p.y + p.height / 2, 0) / neighbors.length : n.y + n.height / 2;
      };
      const scores = new Map(column.map(n => [n.id, score(n)]));
      column.sort((a, b) => scores.get(a.id)! - scores.get(b.id)!); place(column);
    }
  }
  let x = 60;
  for (const column of columns) {
    for (const n of column) n.x = x;
    x += Math.max(228, ...column.map(n => n.width)) + 110;
  }
  compact(nodes, columns.flat(), links);
}

/** Seed nearby chapter members, then relax real links without imposing boundaries. */
function compact(nodes: Card[], ordered: Card[], links: Link[]) {
  if (!nodes.length) return;
  const groups = new Map<string, Card[]>();
  // Preserve document chapter order; dependency order is used inside each chapter.
  for (const n of nodes) if (!groups.has(n.chapterId ?? '')) groups.set(n.chapterId ?? '', []);
  for (const n of ordered) groups.get(n.chapterId ?? '')!.push(n);
  const blocks = [...groups.values()].map(members => {
    const cols = members.length > 2 ? 2 : 1;
    let y = 0;
    for (let start = 0; start < members.length; start += cols) {
      const row = members.slice(start, start + cols);
      row.forEach((n, i) => { n.x = i * 320 + n.width / 2; n.y = y + n.height / 2; });
      y += Math.max(...row.map(n => n.height)) + 74;
    }
    return { members, width: Math.max(...members.map(n => n.x + n.width / 2)), height: y - 74 };
  });
  const cols = Math.ceil(Math.sqrt(blocks.length));
  const heights = Array(cols).fill(0);
  const placements = blocks.map(block => {
    const column = heights.indexOf(Math.min(...heights)), y = heights[column];
    heights[column] += block.height + 135;
    return { block, column, y };
  });
  const widths = Array.from({ length: cols }, (_, i) => Math.max(0, ...placements.filter(p => p.column === i).map(p => p.block.width)));
  for (const { block, column, y } of placements) {
    const x = widths.slice(0, column).reduce((sum, w) => sum + w + 155, 0);
    for (const n of block.members) { n.x += x; n.y += y; }
  }
  const anchors = new Map(nodes.map(n => [n.id, { x: n.x, y: n.y }]));
  const byId = new Map(nodes.map((n, i) => [n.id, i]));
  const pairs = links.flatMap(e => byId.has(e.source) && byId.has(e.target) && e.source !== e.target
    ? [[byId.get(e.source)!, byId.get(e.target)!]] : []);
  const separate = (a: Card, b: Card, gap: number, strength: number) => {
    const dx = b.x - a.x, dy = b.y - a.y;
    const ox = (a.width + b.width) / 2 + gap - Math.abs(dx);
    const oy = (a.height + b.height) / 2 + gap - Math.abs(dy);
    if (ox <= 0 || oy <= 0) return;
    if (ox < oy) { const d = (ox / 2 + .01) * strength * (dx < 0 ? -1 : 1); a.x -= d; b.x += d; }
    else { const d = (oy / 2 + .01) * strength * (dy < 0 ? -1 : 1); a.y -= d; b.y += d; }
  };
  for (let tick = 0; tick < 160; tick++) {
    const forces = nodes.map(n => {
      const anchor = anchors.get(n.id)!;
      return { x: (anchor.x - n.x) * .055, y: (anchor.y - n.y) * .055 };
    });
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[j].x - nodes[i].x, dy = nodes[j].y - nodes[i].y;
      const distance = Math.max(1, Math.hypot(dx, dy)); const f = Math.min(3, 4500 / (distance * distance));
      forces[i].x -= dx / distance * f; forces[j].x += dx / distance * f;
      forces[i].y -= dy / distance * f; forces[j].y += dy / distance * f;
    }
    for (const [i, j] of pairs) {
      const dx = nodes[j].x - nodes[i].x, dy = nodes[j].y - nodes[i].y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const ideal = Math.hypot((nodes[i].width + nodes[j].width) / 2 * dx / distance,
        (nodes[i].height + nodes[j].height) / 2 * dy / distance) + 100;
      // Cross-chapter relationships pull gently; they must not scatter chapter members.
      const sameChapter = nodes[i].chapterId === nodes[j].chapterId;
      const f = (distance - ideal) * (sameChapter ? .035 : .009);
      forces[i].x += dx / distance * f; forces[j].x -= dx / distance * f;
      forces[i].y += dy / distance * f; forces[j].y -= dy / distance * f;
    }
    const cooling = 1 - tick / 220;
    nodes.forEach((n, i) => { n.x += Math.max(-10, Math.min(10, forces[i].x)) * cooling; n.y += Math.max(-10, Math.min(10, forces[i].y)) * cooling; });
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) separate(nodes[i], nodes[j], 55, .6);
  }
  for (let pass = 0; pass < 60; pass++) for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) separate(nodes[i], nodes[j], 45, 1);
  const left = Math.min(...nodes.map(n => n.x - n.width / 2)), top = Math.min(...nodes.map(n => n.y - n.height / 2));
  for (const n of nodes) { n.x = Math.round(n.x - n.width / 2 - left + 60); n.y = Math.round(n.y - n.height / 2 - top + 50); }
}
