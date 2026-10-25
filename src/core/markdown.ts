import { Architecture, ArchitectureNode, ArchitectureEdge, PALETTE } from './model';
import { assignChapterColors } from './chapter-colors';

export class FormatError extends Error { constructor(message: string) { super(message); this.name = 'FormatError'; } }
function fail(message: string): never { throw new FormatError(message); }
const identifier = /^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/;
const asText = (value: unknown, label: string): string => typeof value === 'string' ? value : fail(`${label} 必须是文字`);
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : fail('元数据必须是 JSON 对象');

/** Parses only numbered architecture headings, never headings inside fenced examples. */
export function parseMarkdown(markdown: string): Architecture {
  if (markdown.length > 2_000_000) fail('架构 MD 超过 2 MB');
  const lines = markdown.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split('\n');
  const doc: Architecture = { version: 1, title: '未命名项目', description: '', nodes: [], edges: [] };
  const colorPreferences = new Map<string, string>();
  let current: { number: string; title: string; lines: string[] } | undefined;
  const intro: string[] = []; let graph: Record<string, unknown> = {}; let fence = ''; let graphLines: string[] | null = null; let graphSeen = false;
  const finish = () => {
    if (!current) return;
    const number = current.number; const depth = number.split('.').length;
    if (depth > 3) fail(`${number} 超过章、节、小节三级内容层级`);
    let meta: Record<string, unknown> = {};
    const rawBody = current.lines.join('\n');
    const protectedRanges: Array<[number, number]> = []; let codeFence = ''; let offset = 0; let fenceStart = 0;
    for (const line of current.lines) {
      const marker = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
      if (marker && !codeFence) { codeFence = marker[1]; fenceStart = offset; }
      else if (marker && marker[1][0] === codeFence[0] && marker[1].length >= codeFence.length && !marker[2].trim()) {
        protectedRanges.push([fenceStart, offset + line.length]); codeFence = '';
      }
      offset += line.length + 1;
    }
    if (codeFence) protectedRanges.push([fenceStart, rawBody.length]);
    let metadataSeen = false;
    const body = rawBody.replace(/<!--\s*archside:\s*([\s\S]*?)-->/g, (match, raw: string, index: number) => {
      if (protectedRanges.some(([start, end]) => index >= start && index < end)) return match;
      if (metadataSeen) fail(`${number} 节点元数据重复`);
      metadataSeen = true;
      try { meta = record(JSON.parse(raw)); } catch (e) { fail(`${number} 节点元数据错误：${(e as Error).message}`); }
      return '';
    }).trim();
    // Missing IDs are deterministic provisional IDs; publish persists them into the MD.
    const id = meta.id === undefined ? `node-${number.replace(/\./g, '-')}` : asText(meta.id, 'id');
    if (!identifier.test(id)) fail(`${number} 的 id 不合法，请使用字母、数字、连字符或下划线`);
    const parentNumber = number.split('.').slice(0, -1).join('.');
    const parent = parentNumber ? doc.nodes.find(n => n.number === parentNumber) : undefined;
    if (parentNumber && !parent) fail(`${number} 缺少先出现的父节点 ${parentNumber}`);
    if (doc.nodes.some(n => n.id === id || n.number === number)) fail(`${number} 的编号或 ID 重复`);
    const status = meta.status ?? 'unknown';
    if (!['planned', 'implemented', 'unknown'].includes(status as string)) fail(`${number} 的 status 无效`);
    const files = meta.files ?? [];
    if (!Array.isArray(files) || files.some(f => typeof f !== 'string')) fail(`${number} 的 files 必须是字符串数组`);
    const color = meta.color ?? parent?.color ?? PALETTE[doc.nodes.filter(n => n.depth === 1).length % PALETTE.length].id;
    if (!PALETTE.some(p => p.id === color)) fail(`${number} 的 color 不在预设调色板中`);
    if (depth === 1 && meta.color !== undefined) colorPreferences.set(id, color as string);
    const summary = meta.summary === undefined ? body.split(/\n\s*\n/)[0].replace(/[#*`]/g, '').slice(0, 280) : asText(meta.summary, 'summary');
    doc.nodes.push({ id, number, title: current.title, depth: depth as 1 | 2 | 3,
      ...(parent ? { parentId: parent.id } : {}), chapterId: parent?.chapterId ?? id,
      color: color as string, status: status as ArchitectureNode['status'], files: files as string[], summary, body });
    current = undefined;
  };
  for (const line of lines) {
    const marker = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
    if (marker) {
      if (!fence) {
        fence = marker[1];
        if (marker[2].trim() === 'archside') {
          if (graphSeen) fail('只能有一个 archside 关系代码块');
          graphSeen = true; graphLines = []; continue;
        }
      } else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) {
        fence = '';
        if (graphLines) {
          try { graph = record(JSON.parse(graphLines.join('\n'))); } catch (e) { fail(`关系数据错误：${(e as Error).message}`); }
          graphLines = null; continue;
        }
      }
      (current ? current.lines : intro).push(line); continue;
    }
    if (graphLines) { graphLines.push(line); continue; }
    if (!fence) {
      const title = /^#\s+(.+)$/.exec(line);
      if (title && !current && doc.nodes.length === 0) { doc.title = title[1].trim(); continue; }
      const heading = /^(#{2,6})\s+([1-9]\d*(?:\.[1-9]\d*)*)[.、]?\s+(.+?)\s*#*\s*$/.exec(line);
      if (heading) {
        finish();
        if (heading[2].split('.').length > 3) fail(`${heading[2]} 超过章、节、小节三级内容层级`);
        if (heading[1].length !== heading[2].split('.').length + 1) fail(`${heading[2]} 的标题级别不匹配（章用 ##，节用 ###，小节用 ####）`);
        current = { number: heading[2], title: heading[3], lines: [] }; continue;
      }
    }
    (current ? current.lines : intro).push(line);
  }
  if (graphLines) fail('archside 关系代码块未闭合');
  finish(); doc.description = intro.join('\n').trim();
  if (!doc.nodes.length) fail('未发现节点，请使用 ## 1 节点名、### 1.1 节点名、#### 1.1.1 节点名');
  if (graph.version !== undefined && graph.version !== 1) fail('不支持此架构格式版本');
  const edges = graph.edges ?? [];
  if (!Array.isArray(edges)) fail('edges 必须是数组');
  const edgeIds = new Set<string>();
  doc.edges = edges.map((raw, i): ArchitectureEdge => {
    const e = record(raw); const source = asText(e.source, 'source'); const target = asText(e.target, 'target');
    if (!doc.nodes.some(n => n.id === source) || !doc.nodes.some(n => n.id === target)) fail(`连线 ${i + 1} 引用了不存在的节点（${source} → ${target}）`);
    const kind = e.kind ?? 'data'; if (!['data', 'dependency', 'optional'].includes(kind as string)) fail('连线 kind 无效');
    const id = e.id === undefined ? `edge-${i + 1}` : asText(e.id, 'edge.id');
    if (!identifier.test(id) || edgeIds.has(id)) fail(`连线 ID 无效或重复：${id}`); edgeIds.add(id);
    return { id, source, target, label: e.label === undefined ? '' : asText(e.label, 'label'), kind: kind as ArchitectureEdge['kind'] };
  });
  return assignChapterColors(doc, colorPreferences);
}

export function serializeMarkdown(doc: Architecture): string {
  const out = [`# ${doc.title}`, '', doc.description, ''];
  for (const n of doc.nodes) {
    out.push(`${'#'.repeat(n.depth + 1)} ${n.number} ${n.title}`, '',
      `<!-- archside: ${JSON.stringify({ id: n.id, color: n.color, status: n.status, files: n.files, summary: n.summary }).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')} -->`, '', n.body, '');
  }
  out.push('```archside', JSON.stringify({ version: 1, edges: doc.edges }, null, 2), '```', '');
  return out.join('\n');
}
