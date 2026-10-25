import { PALETTE, type Architecture } from './model';

/** Color the chapter graph; original business edges are counted once, in either direction. */
export function assignChapterColors(doc: Architecture, preferences: Map<string, string>): Architecture {
  const chapters = doc.nodes.filter(n => n.depth === 1).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const ids = chapters.map(n => n.id);
  const colors = PALETTE.map(p => p.id);
  const chapterFor = new Map(doc.nodes.map(n => [n.id, n.chapterId]));
  const neighbors = new Map(ids.map(id => [id, new Map<string, number>()]));
  for (const edge of doc.edges) {
    const a = chapterFor.get(edge.source), b = chapterFor.get(edge.target);
    if (!a || !b || a === b) continue;
    for (const [source, target] of [[a, b], [b, a]]) {
      const weights = neighbors.get(source)!;
      weights.set(target, (weights.get(target) ?? 0) + 1);
    }
  }
  const degree = new Map(ids.map(id => [id, [...neighbors.get(id)!.values()].reduce((sum, weight) => sum + weight, 0)]));
  const assigned = new Map<string, string>();
  const counts = new Map(colors.map(color => [color, 0]));
  const setColor = (id: string, color: string) => {
    const old = assigned.get(id);
    if (old) counts.set(old, counts.get(old)! - 1);
    assigned.set(id, color); counts.set(color, counts.get(color)! + 1);
  };
  // Preserve a complete, already diverse assignment (including serialized results).
  // A changed relationship graph can still improve it below without changing labels gratuitously.
  if (ids.every(id => colors.includes(preferences.get(id)!))
    && new Set(ids.map(id => preferences.get(id))).size === Math.min(ids.length, colors.length)) {
    for (const id of ids) setColor(id, preferences.get(id)!);
  } else {
    const pending = new Set(ids);
    while (pending.size) {
      let chosen = ''; let bestSaturation = -1; let bestDegree = -1;
      for (const id of pending) {
        const saturation = new Set([...neighbors.get(id)!.keys()].map(other => assigned.get(other)).filter(Boolean)).size;
        if (saturation > bestSaturation || saturation === bestSaturation && degree.get(id)! > bestDegree) {
          chosen = id; bestSaturation = saturation; bestDegree = degree.get(id)!;
        }
      }
      const costs = new Map(colors.map(color => [color, 0]));
      for (const [other, weight] of neighbors.get(chosen)!) {
        const color = assigned.get(other);
        if (color) costs.set(color, costs.get(color)! + weight);
      }
      const unused = colors.filter(color => counts.get(color) === 0);
      const available = unused.length ? unused : colors;
      const preference = preferences.get(chosen);
      const selected = [...available].sort((a, b) => costs.get(a)! - costs.get(b)!
        || Number(b === preference) - Number(a === preference)
        || counts.get(a)! - counts.get(b)!
        || colors.indexOf(a) - colors.indexOf(b))[0];
      setColor(chosen, selected); pending.delete(chosen);
    }
  }
  // Strictly reduce the total weight of same-color chapter connections.
  // Two-chapter recoloring can move a repeated color to a completely different
  // weakly connected pair, even when a single move or swap cannot improve it.
  for (;;) {
    const costs = new Map(ids.map(id => [id, new Map(colors.map(color => [color, 0]))]));
    for (const id of ids) for (const [other, weight] of neighbors.get(id)!) {
      const color = assigned.get(other)!;
      costs.get(id)!.set(color, costs.get(id)!.get(color)! + weight);
    }
    let bestDelta = 0; let move: { id: string; color: string; other?: string; otherColor?: string } | undefined;
    for (const id of ids) {
      const color = assigned.get(id)!; const current = costs.get(id)!.get(color)!;
      if (!current) continue;
      if (counts.get(color)! > 1) for (const next of colors) {
        const delta = costs.get(id)!.get(next)! - current;
        if (delta < bestDelta) { bestDelta = delta; move = { id, color: next }; }
      }
      for (const other of ids) {
        const next = assigned.get(other)!;
        if (color === next) continue;
        for (const otherColor of colors) {
          if (otherColor === next || counts.get(color) === 1 && otherColor !== color) continue;
          const delta = costs.get(id)!.get(next)! - current
            + costs.get(other)!.get(otherColor)! - costs.get(other)!.get(next)!
            - (1 + Number(otherColor === color)) * (neighbors.get(id)!.get(other) ?? 0);
          if (delta < bestDelta) { bestDelta = delta; move = { id, color: next, other, otherColor }; }
        }
      }
    }
    if (!move) break;
    setColor(move.id, move.color);
    if (move.other) setColor(move.other, move.otherColor!);
  }
  return { ...doc, nodes: doc.nodes.map(n => ({ ...n, color: assigned.get(n.chapterId)! })) };
}
