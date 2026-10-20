import { Architecture, ArchitectureNode, ArchitectureEdge, Layout } from './model';
import { arrange } from './graph-layout';
import { routeEdges, Route } from './edge-routing';
export interface DisplayNode extends ArchitectureNode { external?: boolean; x: number; y: number; width: number; height: number }
export interface DisplayEdge extends ArchitectureEdge { originalId?: string; structural?: 'parent-child'; projected?: boolean }
export interface Projection { nodes: DisplayNode[]; edges: DisplayEdge[]; routes: Map<string, Route>; width: number; height: number }
export function project(doc: Architecture, chapterId: string | null, detailed: boolean, expanded: Set<string>, layout: Layout): Projection {
  let visible: ArchitectureNode[];
  if (!chapterId) visible = doc.nodes.filter(n => n.depth === (detailed ? 2 : 1));
  else visible = doc.nodes.filter(n => n.chapterId === chapterId && n.depth > 1);
  const original = new Set(visible.map(n => n.id));
  const external = new Set<string>();
  if (chapterId) {
    // Only direct boundary references, rather than recursively importing other chapters.
    const inside = (id: string) => original.has(id);
    for (const e of doc.edges) {
      if (inside(e.source) && !inside(e.target) && e.target !== chapterId) external.add(e.target);
      if (inside(e.target) && !inside(e.source) && e.source !== chapterId) external.add(e.source);
    }
    visible = [...visible, ...doc.nodes.filter(n => external.has(n.id))];
  }
  const mapIds = (id: string): string[] => {
    if (visible.some(n => n.id === id)) return [id];
    const node = doc.nodes.find(n => n.id === id);
    if (!node) return [];
    if (!chapterId && !detailed) return [node.chapterId];
    // A hidden chapter is represented by its visible sections, not silently dropped.
    if (node.depth === 1) return visible.filter(n => n.parentId === node.id).map(n => n.id);
    if (chapterId) return [];
    return node.parentId && visible.some(n => n.id === node.parentId) ? [node.parentId] : [];
  };
  const edges: DisplayEdge[] = [];
  for (const edge of doc.edges) {
    const sources = mapIds(edge.source), targets = mapIds(edge.target);
    const chapterRelation = (chapterId || detailed) && [edge.source, edge.target].some(id => doc.nodes.find(n => n.id === id)?.depth === 1 && !visible.some(n => n.id === id));
    for (const source of sources) for (const target of targets) {
      const multiple = sources.length * targets.length > 1;
      const label = `${chapterRelation ? '章级关系 · ' : ''}${edge.label}${source === target ? `${edge.label ? ' · ' : ''}内部关系` : ''}`;
      edges.push({ ...edge, id: multiple ? `${edge.id}:projected:${source}:${target}` : edge.id, source, target, label,
        originalId: edge.id, projected: source !== edge.source || target !== edge.target });
    }
  }
  const key = chapterId ? `chapter:${chapterId}` : detailed ? 'overview:detailed' : 'overview:simple';
  const saved = layout.views[key]?.positions ?? {};
  const nodes: DisplayNode[] = [];
  const card = (n: ArchitectureNode, x: number, y: number) => {
    const isExpanded = expanded.has(n.id);
    const height = isExpanded ? 155 + (n.files.length ? 32 : 0) : 56;
    const result: DisplayNode = { ...n, x, y, width: 228, height, ...(external.has(n.id) ? { external: true } : {}) };
    nodes.push(result); return result;
  };
  if (!chapterId && !detailed) {
    visible.forEach((n, i) => card(n, 80 + i % 2 * 350, 60 + Math.floor(i / 2) * 230));
  } else {
    visible.forEach(n => card(n, 0, 0));
    const visibleIds = new Set(visible.map(n => n.id));
    // Parent links guide layout; structural membership is drawn separately without arrows.
    const links = [...edges, ...nodes.filter(n => n.parentId && visibleIds.has(n.parentId))
      .map(n => ({ source: n.parentId!, target: n.id }))];
    arrange(nodes, links);
  }
  for (const n of nodes) { const p = saved[n.id]; if (p) { n.x = p.x; n.y = p.y; } }
  // Heading membership used to be conveyed by enclosing boxes. Keep it visible
  // as structural links, without inventing data flow or changing the MD edges.
  if (chapterId || detailed) {
    const visibleIds = new Set(nodes.map(n => n.id));
    for (const n of nodes) {
      if (n.parentId && visibleIds.has(n.parentId)) edges.push({
        id: `structure:parent-child:${n.parentId}:${n.id}`, source: n.parentId, target: n.id,
        kind: 'dependency', label: '组成', structural: 'parent-child',
      });
    }
  }
  const routes = routeEdges(nodes, edges);
  return { nodes, edges, routes, width: Math.max(620, ...nodes.map(n => n.x + n.width + 60), ...[...routes.values()].map(r => r.label.x + r.labelWidth / 2 + 20)),
    height: Math.max(300, ...nodes.map(n => n.y + n.height + 60), ...[...routes.values()].map(r => r.label.y + 25)) };
}
