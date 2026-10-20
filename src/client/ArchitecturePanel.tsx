import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Architecture, ArchitectureNode, Layout, Point, Snapshot } from '../core/model';
import { emptyLayout, palette } from '../core/model';
import { project, DisplayNode } from '../core/projection';
import type { ArchsideApi } from './api';
import { Icon } from './icons';
import styles from './style.css';

type Viewport = { x: number; y: number; zoom: number };
type Navigation = { chapter: string | null; detail: string | null; detailed: boolean };
const scopeText = { architecture: '已更新架构设计', 'architecture-and-code': '已同步更新架构与程序', analysis: '仅分析，未修改', code: '已修改程序' };
const statusText = { planned: '待实现', implemented: '已实现', unknown: '待核实' };
export function ArchitecturePanel({ api, sessionKey }: { api: ArchsideApi; sessionKey: string }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState(''); const [toast, setToast] = useState('');
  const [nav, setNav] = useState<Navigation>({ chapter: null, detail: null, detailed: false });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [layout, setLayout] = useState<Layout>(emptyLayout);
  const [viewport, setViewport] = useState<Viewport>({ x: 40, y: 30, zoom: 1 });
  const [highlight, setHighlight] = useState<string | null>(null);
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [query, setQuery] = useState(''); const [searchOpen, setSearchOpen] = useState(false);
  const surface = useRef<HTMLDivElement>(null); const panel = useRef<HTMLDivElement>(null);
  const state = useRef({ layout, viewport, nav }); state.current = { layout, viewport, nav };
  const pending = useRef<ReturnType<typeof setTimeout>>(); const alive = useRef(true);
  const layoutDirty = useRef(false); const adopted = useRef(false); const focusNonce = useRef(0);
  const lastRevision = useRef(''); const initializedView = useRef('');
  const drag = useRef<{ id?: string; pointer: number; x: number; y: number; start: Point; moved: boolean }>();
  const [dragging, setDragging] = useState(false);
  const [size, setSize] = useState({ width: 700, height: 600 });
  const doc = snap?.architecture ?? null;
  const viewKey = nav.chapter ? `chapter:${nav.chapter}` : nav.detailed ? 'overview:detailed' : 'overview:simple';
  useEffect(() => { setHoverNode(null); }, [viewKey, nav.detail]);
  const positions = layout.views[viewKey]?.positions;
  const projection = useMemo(() => doc ? project(doc, nav.chapter, nav.detailed, expanded, layout) : null, [doc, nav.chapter, nav.detailed, expanded, positions]);
  const chapter = doc?.nodes.find(n => n.id === nav.chapter);
  const detail = doc?.nodes.find(n => n.id === nav.detail);
  const showError = useCallback((err: unknown) => { if (alive.current) setError(err instanceof Error ? err.message : String(err)); }, []);
  const flash = useCallback((text: string) => { setToast(text); }, []);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(''), 3600); return () => clearTimeout(id); }, [toast]);
  const persist = useCallback((next: Layout) => {
    layoutDirty.current = true;
    if (pending.current) clearTimeout(pending.current);
    pending.current = setTimeout(() => {
      api.saveLayout(next).then(() => { if (state.current.layout === next) layoutDirty.current = false; }).catch(showError);
    }, 400);
  }, [api, showError]);
  // Keep a local navigation breadcrumb through tab unmounts, scoped to this DSH session.
  useEffect(() => {
    try { const saved = sessionStorage.getItem(`archside:nav:${sessionKey}`); if (saved) setNav(JSON.parse(saved)); } catch { /* storage can be unavailable */ }
  }, [sessionKey]);
  useEffect(() => { try { sessionStorage.setItem(`archside:nav:${sessionKey}`, JSON.stringify(nav)); } catch {} }, [nav, sessionKey]);
  const applySnapshot = useCallback((next: Snapshot) => {
    setSnap(next); setError('');
    if (!adopted.current && !layoutDirty.current) { setLayout(next.layout); adopted.current = true; }
    if (next.revision !== lastRevision.current) {
      lastRevision.current = next.revision;
      setNav(old => ({ ...old, chapter: next.architecture?.nodes.some(n => n.id === old.chapter) ? old.chapter : null,
        detail: next.architecture?.nodes.some(n => n.id === old.detail) ? old.detail : null }));
    }
    if (next.focus && next.focus.nonce !== focusNonce.current && next.architecture) {
      focusNonce.current = next.focus.nonce;
      const node = next.architecture.nodes.find(n => n.id === next.focus?.id);
      if (node) { setNav(old => ({ ...old, chapter: node.depth === 1 ? null : node.chapterId, detail: null, detailed: node.depth === 1 ? false : old.detailed })); setHighlight(node.id); initializedView.current = ''; }
    }
  }, []);
  useEffect(() => {
    alive.current = true; let stopped = false; let timer: ReturnType<typeof setTimeout>;
    async function read() {
      try { const next = await api.snapshot(); if (!stopped) applySnapshot(next); } catch (err) { if (!stopped) showError(err); }
      if (!stopped) timer = setTimeout(read, 1300);
    }
    void read();
    return () => { stopped = true; alive.current = false; clearTimeout(timer); if (pending.current) { clearTimeout(pending.current); void api.saveLayout(state.current.layout).catch(() => {}); } };
  }, [api, applySnapshot, showError]);
  useEffect(() => {
    if (!surface.current) return;
    const observer = new ResizeObserver(entries => { const rect = entries[0]?.contentRect; if (rect) setSize({ width: rect.width, height: rect.height }); });
    observer.observe(surface.current); return () => observer.disconnect();
  }, [!!doc, !!detail]);
  const fit = useCallback(() => {
    if (!projection) return;
    const zoom = Math.max(.15, Math.min(1.2, (size.width - 85) / projection.width, (size.height - 50) / projection.height));
    setViewport({ zoom, x: (size.width - projection.width * zoom) / 2 + 10, y: Math.max(15, (size.height - projection.height * zoom) / 2) });
  }, [projection, size]);
  useEffect(() => {
    if (!projection || !adopted.current || size.height < 50 || initializedView.current === viewKey) return;
    initializedView.current = viewKey;
    const saved = layout.views[viewKey]?.viewport;
    if (highlight) {
      const n = projection.nodes.find(n => n.id === highlight);
      if (n) { const zoom = Math.min(1, Math.max(.65, (size.width - 120) / 500)); setViewport({ zoom, x: size.width / 2 - (n.x + n.width / 2) * zoom, y: size.height / 2 - (n.y + n.height / 2) * zoom }); return; }
    }
    if (saved) setViewport(saved); else fit();
  }, [viewKey, projection, layout, size, fit, highlight]);
  const saveViewport = useCallback((nextViewport: Viewport) => {
    const old = state.current.layout; const key = state.current.nav.chapter ? `chapter:${state.current.nav.chapter}` : state.current.nav.detailed ? 'overview:detailed' : 'overview:simple';
    const next = { ...old, views: { ...old.views, [key]: { positions: old.views[key]?.positions ?? {}, viewport: nextViewport } } };
    state.current.layout = next; setLayout(next); persist(next);
  }, [persist]);
  const zoomAt = useCallback((factor: number, point?: Point) => {
    const old = state.current.viewport;
    const zoom = Math.max(.15, Math.min(2.5, old.zoom * factor)); const p = point ?? { x: size.width / 2, y: size.height / 2 };
    const next = { x: p.x - (p.x - old.x) * zoom / old.zoom, y: p.y - (p.y - old.y) * zoom / old.zoom, zoom };
    state.current.viewport = next; setViewport(next); saveViewport(next);
  }, [size, saveViewport]);
  useEffect(() => {
    const element = surface.current; if (!element) return;
    const wheel = (e: WheelEvent) => { e.preventDefault(); setMenu(null); const rect = element.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY * .0015), { x: e.clientX - rect.left, y: e.clientY - rect.top }); };
    element.addEventListener('wheel', wheel, { passive: false }); return () => element.removeEventListener('wheel', wheel);
  }, [zoomAt, !!doc, !!detail]);
  const locate = (n: ArchitectureNode) => {
    setNav(old => ({ ...old, chapter: n.depth === 1 ? null : n.chapterId, detail: null, detailed: n.depth === 1 ? false : old.detailed })); setHighlight(n.id); setMenu(null); setSearchOpen(false); initializedView.current = '';
  };
  const rearrange = () => {
    const next = { ...state.current.layout, views: { ...state.current.layout.views, [viewKey]: { positions: {} } } };
    initializedView.current = ''; setHighlight(null); setMenu(null);
    state.current.layout = next; setLayout(next); persist(next); flash('已按关系重新布局当前视图');
  };
  const extend = (n: ArchitectureNode) => {
    setMenu(null);
    if (!nav.chapter) { setNav(old => ({ ...old, chapter: n.chapterId, detail: null })); setHighlight(n.depth === 1 ? null : n.id); }
    else if (n.chapterId !== nav.chapter) locate(n);
    else setNav(old => ({ ...old, detail: n.id }));
  };
  const toggle = (id: string) => { setExpanded(old => { const next = new Set(old); next.has(id) ? next.delete(id) : next.add(id); return next; }); setMenu(null); };
  const openMenu = (id: string, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation(); const rect = panel.current?.getBoundingClientRect(); if (!rect) return;
    const x = Math.max(12, Math.min(rect.width - 138, e.clientX - rect.left + 10));
    const y = Math.max(58, Math.min(rect.height - 160, e.clientY - rect.top - 15));
    setMenu(old => old?.id === id ? null : { id, x, y });
  };
  const reference = async (n: ArchitectureNode) => { try { await api.reference(n.id); setMenu(null); setHighlight(n.id); flash(`已加入对话：@(${n.number} ${n.title})`); } catch (err) { showError(err); } };
  const navigate = (chapter: string | null, detail: string | null) => { setNav(old => ({ ...old, chapter, detail })); setMenu(null); setHighlight(null); };
  const pointerDown = (e: React.PointerEvent, n?: DisplayNode) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button,a,input')) return;
    setMenu(null); e.preventDefault(); e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: n?.id, pointer: e.pointerId, x: e.clientX, y: e.clientY, start: n ? { x: n.x, y: n.y } : { x: viewport.x, y: viewport.y }, moved: false };
  };
  const pointerMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d || d.pointer !== e.pointerId) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) < 4 && !d.moved) return;
    d.moved = true; setDragging(true);
    if (d.id) {
      const old = state.current.layout; const next = { ...old, views: { ...old.views, [viewKey]: { ...old.views[viewKey], positions: { ...old.views[viewKey]?.positions, [d.id]: { x: Math.max(0, d.start.x + dx / viewport.zoom), y: Math.max(0, d.start.y + dy / viewport.zoom) } } } } };
      state.current.layout = next; setLayout(next);
    } else { const next = { ...viewport, x: d.start.x + dx, y: d.start.y + dy }; state.current.viewport = next; setViewport(next); }
  };
  const pointerUp = () => {
    const d = drag.current; drag.current = undefined; setDragging(false);
    if (!d?.moved) return;
    if (d.id) persist(state.current.layout); else saveViewport(state.current.viewport);
  };
  const allOpen = !!projection?.nodes.length && projection.nodes.every(n => expanded.has(n.id));
  const menuNode = doc?.nodes.find(n => n.id === menu?.id);
  const searchResults = doc?.nodes.filter(n => `${n.number} ${n.title} ${n.files.join(' ')} ${n.body}`.toLowerCase().includes(query.toLowerCase())).slice(0, 25) ?? [];
  const requestGeneration = () => api.insertPrompt('请为当前项目生成或同步 ArchSide 架构图：先用 archside_read 检查现有架构；有代码则扫描相关代码，没有代码则根据当前项目需求进行架构设计。生成 architecture.md 并用 archside_publish 发布，区分已实现与待实现节点。完成后在对话中说明本次修改了架构图，还是架构图与程序一起修改。').then(() => flash('生成请求已加入输入框，补充需求后发送')).catch(showError);
  return <div className="archside" ref={panel} data-testid="architecture-panel" onKeyDown={e => { if (e.key === 'Escape') { setMenu(null); setSearchOpen(false); } }}>
    <style>{styles}</style>
    <header className="as-header">
      <div className="as-brand"><span className="as-brand-icon"><Icon name="layers" size={17}/></span><strong>ArchSide</strong><span className="as-header-label">项目架构</span></div>
      <div className="as-header-actions"><button title="查找节点、文件或方法" aria-label="查找节点" onClick={() => setSearchOpen(!searchOpen)}><Icon name="search"/></button><button title="重新读取架构 MD" aria-label="刷新架构" onClick={() => api.snapshot().then(applySnapshot).catch(showError)}><Icon name="refresh" size={16}/></button></div>
    </header>
    <div className="as-breadcrumb"><button onClick={() => navigate(null, null)}>项目总览</button>{chapter && <><span>/</span><button onClick={() => navigate(chapter.id, null)}>{chapter.number} {chapter.title}</button></>}{detail && <><span>/</span><span>{detail.number} {detail.title}</span></>}
      <span className={`as-sync ${snap?.busy ? 'is-busy' : snap?.stale ? 'is-stale' : ''}`}><i/>{snap?.busy ? 'Agent 处理中' : snap?.stale ? '架构可能需要同步' : snap ? '已读取 MD' : '连接中'}</span>
    </div>
    {(error || snap?.error) && <div className="as-error" role="alert">{error || snap?.error}<button aria-label="关闭提示" onClick={() => setError('')}><Icon name="close" size={14}/></button></div>}
    {snap?.stale && !snap.busy && <div className="as-stale">检测到项目文件变化，架构可能需要同步。<button onClick={requestGeneration}>交给 Agent 检查</button></div>}
    {searchOpen && <div className="as-search"><div className="as-search-input"><Icon name="search"/><input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="查找节点、文件或方法…" aria-label="搜索架构节点"/><button aria-label="关闭搜索" onClick={() => setSearchOpen(false)}><Icon name="close" size={15}/></button></div><div className="as-results">{searchResults.length ? searchResults.map(n => <button key={n.id} onClick={() => locate(n)}><span className="as-result-dot" style={{ background: palette(n.color).ink }}/><span><strong>{n.number} {n.title}</strong><small>{n.files.join(' · ') || statusText[n.status]}</small></span><Icon name="chevron" size={13}/></button>) : <p>未找到匹配节点</p>}</div></div>}
    {!doc ? <div className="as-empty"><div className="as-empty-graphic"><Icon name="layers" size={40}/></div><span className="as-eyebrow">从想法，到结构</span><h2>让项目架构清晰可见</h2><p>让 Agent 扫描代码，或从你的需求开始，<br/>生成可以逐层探索的项目架构。</p><button className="as-primary" onClick={requestGeneration}>交给 Agent 生成 <Icon name="chevron" size={15}/></button><small>已有文件？将 ArchSide 格式的 architecture.md 放在项目根目录。</small></div> : <>
      <div className="as-project-heading"><div><span className="as-eyebrow">{detail ? 'NODE DETAILS' : nav.chapter ? 'CHAPTER ARCHITECTURE' : 'PROJECT ARCHITECTURE'}</span><h1>{detail ? `${detail.number} ${detail.title}` : chapter ? `${chapter.number} ${chapter.title}` : doc.title}</h1><p>{detail ? detail.summary : chapter ? chapter.summary : doc.description.replace(/[#*`]/g, '').split('\n').filter(Boolean).slice(0, 3).join(' ')}</p></div>{detail ? <button className="as-mention-action" onClick={() => reference(detail)}>＠ 选中节点</button> : <span className="as-node-count">{projection?.nodes.length} <span>节点</span></span>}</div>
      <div className="as-main">
        <nav className="as-levels" aria-label="架构层级">
          <button title="第一层 · 项目总览" aria-label="第一层 项目总览" className={`as-level level-one ${!nav.chapter ? 'active' : ''}`} onClick={() => navigate(null, null)}><Icon name="layers" size={18}/></button>
          {chapter && <button title={`第二层 · ${chapter.title}`} aria-label="第二层 章内架构" className={`as-level ${!detail ? 'active' : ''}`} style={{ background: palette(chapter.color).fill, color: palette(chapter.color).ink }} onClick={() => navigate(chapter.id, null)}><Icon name="layers" size={18}/></button>}
          {detail && <button title="第三层 · 节点详情" aria-label="第三层 节点详情" className="as-level level-three active"><Icon name="file" size={17}/></button>}
        </nav>
        {detail ? <Detail node={detail} doc={doc} api={api} onLocate={locate} onReference={reference} onError={showError}/> : <div className={`as-surface ${dragging ? 'dragging' : ''}`} ref={surface} data-testid="graph-surface" onPointerDown={e => pointerDown(e)} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onClick={() => setMenu(null)}>
          <div className="as-world" style={{ width: projection?.width, height: projection?.height, transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}>
            <svg className="as-edges" width={projection?.width} height={projection?.height} aria-label="节点关系连线"><defs>{['blue', 'purple', 'teal', 'orange', 'slate'].map(color => <marker key={color} id={`as-arrow-${color}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill={palette(color).ink}/></marker>)}</defs>{projection?.edges.map(edge => {
              const source = projection.nodes.find(n => n.id === edge.source), target = projection.nodes.find(n => n.id === edge.target); if (!source || !target) return null;
              const route = projection.routes.get(edge.id); if (!route) return null;
              const { d, label, labelWidth } = route; const color = edge.kind === 'optional' ? 'slate' : source.color;
              const active = hoverNode === source.id || hoverNode === target.id;
              const original = doc.edges.find(e => e.id === edge.originalId);
              const originalSource = doc.nodes.find(n => n.id === original?.source), originalTarget = doc.nodes.find(n => n.id === original?.target);
              const description = edge.structural ? (edge.structural === 'parent-child' ? '标题层级的父子归属，不表示业务流向' : '属于同一章，不表示先后执行或数据依赖')
                : `${originalSource?.number} ${originalSource?.title} → ${originalTarget?.number} ${originalTarget?.title}${edge.projected ? '（当前层级投影）' : ''}`;
              return <g key={edge.id} data-edge={edge.id} data-relationship={edge.structural ? 'structural' : 'explicit'} opacity={hoverNode && !active ? .14 : edge.structural && !active ? .62 : 1}><title>{description}</title><path d={d} fill="none" stroke={palette(color).ink} strokeWidth={active ? 1.8 : edge.structural ? .9 : 1.15} vectorEffect="non-scaling-stroke" strokeDasharray={edge.structural ? '2 4' : edge.kind === 'optional' ? '5 4' : undefined} markerEnd={edge.structural ? undefined : `url(#as-arrow-${color})`}/>{edge.label && <><rect x={label.x - labelWidth / 2} y={label.y - 9} width={labelWidth} height={17} rx={3} fill="#fcfdfb" fillOpacity=".96"/><text x={label.x} y={label.y} dominantBaseline="middle" textAnchor="middle" className="as-edge-label" fill={palette(color).ink}>{edge.label}</text></>}</g>;
            })}</svg>
            {projection?.nodes.map(n => <div key={n.id} className={`as-node ${n.external ? 'external' : ''} ${highlight === n.id ? 'highlighted' : ''}`} data-testid={`node-${n.id}`} style={{ left: n.x, top: n.y, width: n.width, height: n.height, '--node-ink': palette(n.color).ink, '--node-fill': palette(n.color).fill } as React.CSSProperties}
              onPointerEnter={() => setHoverNode(n.id)} onPointerLeave={() => setHoverNode(null)} onPointerDown={e => pointerDown(e, n)} onContextMenu={e => openMenu(n.id, e)} onDoubleClick={() => extend(n)}>
              <div className="as-node-heading"><span className="as-node-accent"/><span className="as-node-number">{n.number}</span><strong title={n.title}>{n.title}</strong><button className="as-node-more" aria-label={`${n.number} ${n.title} 节点操作`} title="节点操作 · 也可右键" onPointerDown={e => e.stopPropagation()} onClick={e => openMenu(n.id, e)}><Icon name="chevron" size={15}/></button></div>
              {expanded.has(n.id) && <div className="as-node-description"><p>{n.summary || '暂无简要说明'}</p>{!!n.files.length && <div className="as-node-files" title={n.files.join('\n')}><Icon name="code" size={12}/><span>{n.files.join(' · ')}</span></div>}<span className={`as-status ${n.status}`}>{statusText[n.status]}{n.external ? ' · 跨章引用' : ''}</span></div>}
            </div>)}
          </div>
        </div>}
        {!detail && <>
          <div className="as-legend">{doc.nodes.filter(n => n.depth === 1).map(n => <span key={n.id}><i style={{ background: palette(n.color).ink }}/>{n.title}</span>)}<span className="as-structure-key"><i/>点线：层级归属</span></div>
          <div className="as-controls">{!nav.chapter && <div className="as-segment" aria-label="总览显示模式"><button className={!nav.detailed ? 'selected' : ''} onClick={() => { setNav(old => ({ ...old, detailed: false })); setHighlight(null); }}>简洁</button><button className={nav.detailed ? 'selected' : ''} onClick={() => { setNav(old => ({ ...old, detailed: true })); setHighlight(null); }}>详细</button></div>}<div className="as-control-row"><button className="as-expand-all" onClick={() => setExpanded(old => { const next = new Set(old); for (const n of projection?.nodes ?? []) allOpen ? next.delete(n.id) : next.add(n.id); return next; })}>{allOpen ? '全部收起' : '全部展开'}</button><span className="as-control-divider"/><button title="缩小" aria-label="缩小" onClick={() => zoomAt(1 / 1.2)}><Icon name="minus" size={17}/></button><span className="as-zoom-value">{Math.round(viewport.zoom * 100)}%</span><button title="放大" aria-label="放大" onClick={() => zoomAt(1.2)}><Icon name="plus" size={17}/></button><button title="按关系重新布局（仅重置当前视图）" aria-label="按关系重新布局" onClick={rearrange}><Icon name="layout" size={16}/></button><button title="适应画布" aria-label="适应画布" onClick={fit}><Icon name="fit" size={16}/></button></div></div>
        </>}
      </div>
      <footer className="as-footer"><span><Icon name="file" size={12}/>{snap?.path}</span><span>{snap?.notice ? scopeText[snap.notice.scope] : detail ? '只读详情 · 通过 @ 与 Agent 协作' : '滚轮缩放 · 拖动平移 · 右键节点操作'}</span></footer>
    </>}
    {menu && menuNode && <><button className="as-menu-dismiss" aria-label="关闭节点菜单" onClick={() => setMenu(null)}/><div className="as-node-menu" role="menu" style={{ left: menu.x, top: menu.y }}><button role="menuitem" onClick={() => reference(menuNode)}><b>＠</b>选中 @</button><button role="menuitem" onClick={() => extend(menuNode)}><Icon name="expand" size={15}/>扩展</button><button role="menuitem" onClick={() => toggle(menuNode.id)}><span style={{ transform: expanded.has(menuNode.id) ? 'rotate(180deg)' : undefined }}><Icon name="down" size={15}/></span>{expanded.has(menuNode.id) ? '收起' : '展开'}</button></div></>}
    {toast && <div className="as-toast" role="status"><Icon name="check" size={15}/>{toast}</div>}
  </div>;
}

function Detail({ node, doc, api, onLocate, onReference, onError }: { node: ArchitectureNode; doc: Architecture; api: ArchsideApi; onLocate(n: ArchitectureNode): void; onReference(n: ArchitectureNode): void; onError(err: unknown): void }) {
  const relations = doc.edges.filter(e => e.source === node.id || e.target === node.id);
  const Image = useMemo(() => function LocalImage({ src, alt }: { src?: string; alt?: string }) {
    const [url, setUrl] = useState<string>(); const [error, setError] = useState('');
    useEffect(() => {
      let alive = true; setUrl(undefined); setError('');
      if (src && !/^(https?:|data:|\/\/)/i.test(src)) Promise.resolve().then(() => api.asset(decodeURIComponent(src))).then(value => { if (alive) setUrl(value); }).catch(err => { if (alive) setError(String(err)); });
      else setError('请使用项目内的相对图片路径');
      return () => { alive = false; };
    }, [src]);
    return url ? <img src={url} alt={alt ?? ''}/> : <span className="as-image-placeholder">{alt || src} · {error || '加载图片…'}</span>;
  }, [api]);
  return <article className="as-detail" data-testid="node-detail" key={node.id}>
    <div className="as-detail-meta"><span className={`as-status ${node.status}`}>{statusText[node.status]}</span><span style={{ color: palette(node.color).ink }}>{doc.nodes.find(n => n.id === node.chapterId)?.title}</span><span>节点 {node.number}</span></div>
    <div className="as-detail-body"><Markdown remarkPlugins={[remarkGfm]} components={{ img: Image, a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer noopener">{children}</a> }}>{node.body || '此节点尚未补充详情。使用「选中节点」向 Agent 询问或完善设计。'}</Markdown></div>
    {!!node.files.length && <section className="as-detail-section"><h3><Icon name="code" size={15}/>关联程序</h3>{node.files.map(file => <div className="as-file-row" key={file}><Icon name="file" size={14}/><code>{file}</code></div>)}<p className="as-muted">通过 @节点，让 Agent 定位并修改相应程序。</p></section>}
    {!!relations.length && <section className="as-detail-section"><h3><Icon name="layers" size={15}/>上下游关系</h3>{relations.map(edge => { const upstream = edge.target === node.id; const other = doc.nodes.find(n => n.id === (upstream ? edge.source : edge.target)); return other ? <button className="as-relation" key={edge.id} onClick={() => onLocate(other)}><span>{upstream ? '来自' : '流向'}</span><strong>{other.number} {other.title}</strong><small>{edge.label || (edge.kind === 'optional' ? '可选关系' : '结构关系')}</small><Icon name="chevron" size={13}/></button> : null; })}</section>}
    <div className="as-detail-note">详情以 Markdown 保存。需要调整规范、示例或实现？<button onClick={() => onReference(node)}>＠ 与 Agent 讨论此节点</button></div>
  </article>;
}
