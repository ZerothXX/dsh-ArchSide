export type NodeStatus = 'planned' | 'implemented' | 'unknown';
export type EdgeKind = 'data' | 'dependency' | 'optional';
export interface ArchitectureNode {
  id: string; number: string; title: string; depth: 1 | 2 | 3; parentId?: string;
  chapterId: string; color: string; status: NodeStatus; files: string[]; summary: string; body: string;
}
export interface ArchitectureEdge { id: string; source: string; target: string; label: string; kind: EdgeKind }
export interface Architecture { version: 1; title: string; description: string; nodes: ArchitectureNode[]; edges: ArchitectureEdge[] }
export interface Point { x: number; y: number }
export interface ViewLayout { positions: Record<string, Point>; viewport?: { x: number; y: number; zoom: number } }
export interface Layout { version: 1; views: Record<string, ViewLayout> }
export interface Snapshot {
  architecture: Architecture | null; markdown: string; revision: string; layout: Layout;
  path: string; busy: boolean; stale: boolean; error?: string; focus?: { id: string; nonce: number };
  notice?: { scope: 'architecture' | 'architecture-and-code' | 'analysis' | 'code'; text: string; at: number };
}
export const PALETTE = [
  { id: 'blue', label: '蓝色', ink: '#4279b9', fill: '#eff5fd', group: '#f5f8fe' },
  { id: 'purple', label: '紫色', ink: '#8a6bb6', fill: '#f4effb', group: '#faf7fd' },
  { id: 'teal', label: '青色', ink: '#308e82', fill: '#edf7f3', group: '#f5faf8' },
  { id: 'orange', label: '橙色', ink: '#bf8738', fill: '#fff6e9', group: '#fffbf3' },
  { id: 'slate', label: '灰蓝', ink: '#698398', fill: '#eff3f6', group: '#f7f9fb' },
];
export const palette = (id: string) => PALETTE.find(p => p.id === id) ?? PALETTE[0];
export const emptyLayout = (): Layout => ({ version: 1, views: {} });
export function descendants(doc: Architecture, id: string) {
  const ids = new Set([id]);
  for (const n of doc.nodes) if (n.parentId && ids.has(n.parentId)) ids.add(n.id);
  return doc.nodes.filter(n => ids.has(n.id) && n.id !== id);
}
export function nodeContext(doc: Architecture, ids: string[]) {
  const chosen = doc.nodes.filter(n => ids.includes(n.id));
  const related = new Set(ids);
  for (const n of chosen) for (const child of descendants(doc, n.id)) related.add(child.id);
  const edges = doc.edges.filter(e => related.has(e.source) || related.has(e.target));
  const connected = new Set(edges.flatMap(e => [e.source, e.target]));
  return { selected: chosen, descendants: doc.nodes.filter(n => related.has(n.id) && !ids.includes(n.id)),
    connected: doc.nodes.filter(n => connected.has(n.id) && !related.has(n.id)), edges };
}
