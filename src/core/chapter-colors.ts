import { PALETTE, type Architecture } from './model';

/** First eight numbered chapters are distinct; later chapters reuse the least connected color. */
export function assignChapterColors(doc: Architecture): Architecture {
  // Compare positive integer chapter numbers without numeric precision limits (1, 2, ..., 10).
  const chapters = doc.nodes.filter(n => n.depth === 1).sort((a, b) =>
    a.number.length - b.number.length || (a.number < b.number ? -1 : a.number > b.number ? 1 : 0));
  const neighbors = new Map(chapters.map(n => [n.id, new Map<string, number>()]));
  const chapterFor = new Map(doc.nodes.map(n => [n.id, n.chapterId]));
  for (const edge of doc.edges) {
    const a = chapterFor.get(edge.source), b = chapterFor.get(edge.target);
    if (!a || !b || a === b) continue;
    for (const [source, target] of [[a, b], [b, a]]) {
      const weights = neighbors.get(source)!;
      weights.set(target, (weights.get(target) ?? 0) + 1);
    }
  }
  const assigned = new Map<string, string>();
  const counts = new Map(PALETTE.map(p => [p.id, 0]));
  for (const [index, chapter] of chapters.entries()) {
    let color = PALETTE[index]?.id;
    if (index >= PALETTE.length) {
      const costs = new Map(PALETTE.map(p => [p.id, 0]));
      // Include EVERY earlier member of a color group, including earlier overflow chapters.
      // Direction does not matter; each original relationship contributes exactly once.
      for (const [other, weight] of neighbors.get(chapter.id)!) {
        const earlierColor = assigned.get(other);
        if (earlierColor) costs.set(earlierColor, costs.get(earlierColor)! + weight);
      }
      color = [...PALETTE].sort((a, b) => costs.get(a.id)! - costs.get(b.id)!
        || counts.get(a.id)! - counts.get(b.id)!
        || PALETTE.indexOf(a) - PALETTE.indexOf(b))[0].id;
    }
    assigned.set(chapter.id, color);
    counts.set(color, counts.get(color)! + 1);
  }
  return { ...doc, nodes: doc.nodes.map(n => ({ ...n, color: assigned.get(n.chapterId)! })) };
}
