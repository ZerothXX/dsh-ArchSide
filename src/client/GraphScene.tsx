import React, { memo, useMemo, useState } from 'react';
import type { Architecture, ArchitectureNode } from '../core/model';
import { PALETTE, palette } from '../core/model';
import type { DisplayNode, Projection } from '../core/projection';
import { Icon } from './icons';
const statusText = { planned: '待实现', implemented: '已实现', unknown: '待核实' };
export interface SceneActions {
  pointerDown(event: React.PointerEvent, node?: DisplayNode): void;
  openMenu(id: string, event: React.MouseEvent): void;
  extend(node: ArchitectureNode): void;
}
export const GraphScene = memo(function GraphScene({ projection, doc, expanded, highlight, actions, dragging }: {
  projection: Projection; doc: Architecture; expanded: Set<string>; highlight: string | null;
  actions: SceneActions; dragging: React.MutableRefObject<unknown>;
}) {
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const nodes = useMemo(() => new Map(projection.nodes.map(n => [n.id, n])), [projection]);
  const originalNodes = useMemo(() => new Map(doc.nodes.map(n => [n.id, n])), [doc]);
  const originalEdges = useMemo(() => new Map(doc.edges.map(e => [e.id, e])), [doc]);
  const { pointerDown, openMenu, extend } = actions;
  return <>
            <svg className="as-edges" width={projection.width} height={projection.height} aria-label="节点关系连线"><defs>{PALETTE.map(({ id: color }) => <marker key={color} id={`as-arrow-${color}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill={palette(color).ink}/></marker>)}</defs>{projection.edges.map(edge => {
              const source = nodes.get(edge.source), target = nodes.get(edge.target); if (!source || !target) return null;
              const route = projection.routes.get(edge.id); if (!route) return null;
              const { d, label, labelWidth } = route; const color = edge.kind === 'optional' ? 'slate' : source.color;
              const active = hoverNode === source.id || hoverNode === target.id;
              const original = originalEdges.get(edge.originalId ?? "");
              const originalSource = originalNodes.get(original?.source ?? ""), originalTarget = originalNodes.get(original?.target ?? "");
              const description = edge.structural ? '标题层级的父子归属，不表示业务流向'
                : `${originalSource?.number} ${originalSource?.title} → ${originalTarget?.number} ${originalTarget?.title}${edge.projected ? '（当前层级投影）' : ''}`;
              return <g key={edge.id} data-edge={edge.id} data-relationship={edge.structural ? 'structural' : 'explicit'} opacity={hoverNode && !active ? .14 : edge.structural && !active ? .62 : 1}><title>{description}</title><path d={d} fill="none" stroke={palette(color).ink} strokeWidth={active ? 1.8 : edge.structural ? .9 : 1.15} vectorEffect="non-scaling-stroke" strokeDasharray={edge.structural ? '2 4' : edge.kind === 'optional' ? '5 4' : undefined} markerEnd={edge.structural ? undefined : `url(#as-arrow-${color})`}/>{edge.label && <><rect x={label.x - labelWidth / 2} y={label.y - 9} width={labelWidth} height={17} rx={3} fill="#fcfdfb" fillOpacity=".96"/><text x={label.x} y={label.y} dominantBaseline="middle" textAnchor="middle" className="as-edge-label" fill={palette(color).ink}>{edge.label}</text></>}</g>;
            })}</svg>
            {projection.nodes.map(n => <div key={n.id} className={`as-node ${n.external ? 'external' : ''} ${highlight === n.id ? 'highlighted' : ''}`} data-testid={`node-${n.id}`} style={{ left: n.x, top: n.y, width: n.width, height: n.height, '--node-ink': palette(n.color).ink, '--node-fill': palette(n.color).fill } as React.CSSProperties}
              onPointerEnter={() => { if (!dragging.current) setHoverNode(n.id); }} onPointerLeave={() => { if (!dragging.current) setHoverNode(null); }} onPointerDown={e => pointerDown(e, n)} onContextMenu={e => openMenu(n.id, e)} onDoubleClick={() => extend(n)}>
              <div className="as-node-heading"><span className="as-node-accent"/><span className="as-node-number">{n.number}</span><strong title={n.title}>{n.title}</strong><button className="as-node-more" aria-label={`${n.number} ${n.title} 节点操作`} title="节点操作 · 也可右键" onPointerDown={e => e.stopPropagation()} onClick={e => openMenu(n.id, e)}><Icon name="chevron" size={15}/></button></div>
              {expanded.has(n.id) && <div className="as-node-description"><p>{n.summary || '暂无简要说明'}</p>{!!n.files.length && <div className="as-node-files" title={n.files.join('\n')}><Icon name="code" size={12}/><span>{n.files.join(' · ')}</span></div>}<span className={`as-status ${n.status}`}>{statusText[n.status]}{n.external ? ' · 跨章引用' : ''}</span></div>}
            </div>)}
  </>;
});
