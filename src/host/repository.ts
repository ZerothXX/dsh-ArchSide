import { promises as fs, watch, FSWatcher } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { parseMarkdown, serializeMarkdown } from '../core/markdown';
import { emptyLayout, Layout, Snapshot } from '../core/model';

const hash = (text: string) => createHash('sha256').update(text).digest('hex');
export const ARCHITECTURE_FILE = 'architecture.md';
const ignored = /(^|[\\/])(node_modules|\.git|\.cache|dist|artifacts|\.dsh|\.archside)([\\/]|$)/;
export function validateLayout(input: unknown): Layout {
  if (!input || typeof input !== 'object' || (input as Layout).version !== 1) throw new Error('布局版本无效');
  const views = (input as Layout).views;
  if (!views || typeof views !== 'object' || Array.isArray(views) || Object.keys(views).length > 3000) throw new Error('布局数据无效');
  for (const [key, view] of Object.entries(views)) {
    if (key === '__proto__' || !view || typeof view !== 'object' || !view.positions || typeof view.positions !== 'object') throw new Error('布局视图无效');
    for (const point of Object.values(view.positions)) if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || Math.abs(point.x) > 1e6 || Math.abs(point.y) > 1e6) throw new Error('节点坐标无效');
    if (view.viewport && (!Number.isFinite(view.viewport.x) || !Number.isFinite(view.viewport.y) || !Number.isFinite(view.viewport.zoom) || view.viewport.zoom < .15 || view.viewport.zoom > 2.5)) throw new Error('缩放数据无效');
  }
  if (JSON.stringify(input).length > 2_000_000) throw new Error('布局过大');
  return structuredClone(input as Layout);
}

interface Entry { root: string; snapshot: Snapshot; pending?: Snapshot; ready?: Promise<void>; watcher?: FSWatcher; busy: Set<string>; dirty: boolean; queue: Promise<unknown>; lastAccess: number }
/** Single writer per workspace, CAS architecture commits, and independent persisted layouts. */
export class ArchitectureRepository {
  private entries = new Map<string, Entry>();
  private reap: ReturnType<typeof setInterval>;
  constructor() { this.reap = setInterval(() => { for (const [key, e] of this.entries) if (!e.busy.size && Date.now() - e.lastAccess > 30 * 60_000) { e.watcher?.close(); this.entries.delete(key); } }, 60_000); this.reap.unref(); }
  private async entry(root: string): Promise<Entry> {
    root = await fs.realpath(root);
    let e = this.entries.get(root);
    if (e) { await e.ready; e.lastAccess = Date.now(); return e; }
    e = { root, snapshot: { architecture: null, markdown: '', revision: '', layout: emptyLayout(), path: ARCHITECTURE_FILE, busy: false, stale: false }, busy: new Set(), dirty: true, queue: Promise.resolve(), lastAccess: Date.now() };
    this.entries.set(root, e);
    const entry = e;
    entry.ready = (async () => {
    try { entry.snapshot.layout = validateLayout(JSON.parse(await fs.readFile(await this.safePath(root, '.archside/layout.json'), 'utf8'))); } catch (err) { if ((err as NodeJS.ErrnoException).code !== 'ENOENT') entry.snapshot.error = `布局读取失败：${(err as Error).message}`; }
    try {
      entry.watcher = watch(root, { recursive: true }, (_event, name) => {
        if (!name || ignored.test(name)) return;
        if (name.replace(/\\/g, '/') === ARCHITECTURE_FILE) entry.dirty = true;
        else if (!name.endsWith('.tmp')) entry.snapshot.stale = true;
      });
      entry.watcher.on('error', err => { entry.snapshot.error = `文件观察失败，请手动刷新：${err.message}`; });
    } catch { entry.snapshot.error = '此环境不支持递归文件观察，架构文件仍会轮询更新'; }
    })();
    await entry.ready;
    return entry;
  }
  /** Deny traversal and symlinks escaping the selected workspace, including missing descendants. */
  async safePath(root: string, relative: string) {
    if (typeof relative !== 'string' || path.isAbsolute(relative)) throw new Error('请使用项目内的相对路径');
    const canonicalRoot = await fs.realpath(root); const target = path.resolve(canonicalRoot, relative);
    const contains = (p: string) => { const rel = path.relative(canonicalRoot, p); return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel)); };
    if (!contains(target)) throw new Error('路径不在当前项目内');
    let existing = target;
    for (;;) {
      try { if (!contains(await fs.realpath(existing))) throw new Error('路径通过符号链接离开了当前项目'); break; }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; const parent = path.dirname(existing); if (parent === existing) throw e; existing = parent; }
    }
    return target;
  }
  private serialize<T>(entry: Entry, action: () => Promise<T>): Promise<T> {
    const next = entry.queue.then(action, action); entry.queue = next.catch(() => {}); return next;
  }
  private async read(e: Entry) {
    // Read even without a watch event (atomic replacement, network volumes, watcher failure).
    let markdown: string;
    try { markdown = await fs.readFile(await this.safePath(e.root, ARCHITECTURE_FILE), 'utf8'); }
    catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') { e.snapshot.architecture = null; e.snapshot.markdown = ''; e.snapshot.revision = ''; return; }
      throw err;
    }
    const revision = hash(markdown);
    if (revision !== e.snapshot.revision) {
      try { const architecture = parseMarkdown(markdown); e.snapshot = { ...e.snapshot, architecture, markdown, revision, error: undefined }; }
      catch (err) { e.snapshot.error = `MD 解析失败，暂保留上次有效图：${(err as Error).message}`; }
    }
    e.dirty = false;
  }
  async snapshot(root: string, latestForAgent = false) {
    const e = await this.entry(root);
    return this.serialize(e, async () => {
      if (latestForAgent && e.busy.size) {
        const detached = { ...e, snapshot: structuredClone(e.pending ?? e.snapshot) };
        await this.read(detached); return detached.snapshot;
      }
      if (!e.busy.size) await this.read(e); return structuredClone(e.snapshot);
    });
  }
  async publish(root: string, markdown: string, expectedRevision: string, scope: 'architecture' | 'architecture-and-code' | 'analysis' | 'code', summary: string) {
    if (!['architecture', 'architecture-and-code', 'analysis', 'code'].includes(scope)) throw new Error('修改范围无效');
    if (typeof summary !== 'string' || !summary.trim()) throw new Error('请说明本次修改范围');
    const e = await this.entry(root);
    return this.serialize(e, async () => {
      const target = await this.safePath(e.root, ARCHITECTURE_FILE);
      let before = ''; try { before = await fs.readFile(target, 'utf8'); } catch (err) { if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err; }
      if ((before ? hash(before) : '') !== expectedRevision) throw new Error('架构 MD 已被其他任务修改，请重新读取并合并后再提交');
      const architecture = parseMarkdown(markdown), canonical = serializeMarkdown(architecture);
      if (before) { const backup = await this.safePath(e.root, '.archside/history'); await fs.mkdir(backup, { recursive: true }); await fs.writeFile(path.join(backup, `${Date.now()}-${randomUUID()}.md`), before); }
      await this.atomicWrite(target, canonical);
      const published = { ...e.snapshot, architecture, markdown: canonical, revision: hash(canonical), stale: false, error: undefined,
        notice: { scope, text: summary, at: Date.now() } };
      if (e.busy.size) e.pending = published; else e.snapshot = published;
      return structuredClone(published);
    });
  }
  async saveLayout(root: string, input: unknown) {
    const layout = validateLayout(input); const e = await this.entry(root);
    return this.serialize(e, async () => { const target = await this.safePath(e.root, '.archside/layout.json'); await this.atomicWrite(target, JSON.stringify(layout, null, 2)); e.snapshot.layout = layout; return { saved: true }; });
  }
  async setBusy(root: string, sessionId: string, busy: boolean) {
    const e = await this.entry(root);
    return this.serialize(e, async () => {
      if (busy) { if (!e.busy.size) await this.read(e); e.busy.add(sessionId); } else e.busy.delete(sessionId);
      if (!e.busy.size && e.pending) { e.snapshot = { ...e.pending, layout: e.snapshot.layout }; e.pending = undefined; }
      e.snapshot.busy = e.busy.size > 0; if (!e.snapshot.busy) await this.read(e);
    });
  }
  async focus(root: string, id: string) {
    const e = await this.entry(root);
    return this.serialize(e, async () => { if (!(e.pending ?? e.snapshot).architecture?.nodes.some(n => n.id === id)) throw new Error(`未找到节点 ${id}`); const focus = { id, nonce: Date.now() }; if (e.pending) e.pending.focus = focus; else e.snapshot.focus = focus; return { focused: id }; });
  }
  async asset(root: string, relative: string) {
    const target = await this.safePath(root, relative);
    const ext = path.extname(target).toLowerCase(); const mime = ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' } as Record<string, string>)[ext];
    if (!mime) throw new Error('详情图片仅支持 PNG、JPEG、WebP、GIF');
    if ((await fs.stat(target)).size > 4_000_000) throw new Error('图片超过 4 MB');
    return { data: `data:${mime};base64,${(await fs.readFile(target)).toString('base64')}` };
  }
  private async atomicWrite(target: string, data: string) {
    await fs.mkdir(path.dirname(target), { recursive: true }); const temp = `${target}.${randomUUID()}.tmp`;
    try { await fs.writeFile(temp, data, 'utf8'); await fs.rename(temp, target); } finally { await fs.rm(temp, { force: true }); }
  }
  close() { clearInterval(this.reap); for (const e of this.entries.values()) e.watcher?.close(); this.entries.clear(); }
}
