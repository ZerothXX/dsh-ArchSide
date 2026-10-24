import * as DshProtocol from '@deepseek-ai/dsh-typert-protocol';
import * as DshTools from '@deepseek-ai/dsh-tools';
import type { Context } from '@deepseek-ai/cordis';
import { ArchitectureRepository } from './repository';
import { nodeContext } from '../core/model';
import { FORMAT_GUIDE, AGENT_GUIDE } from './instructions';
import { ARCHSIDE_REMOTE } from '../core/remote';
import { requireDshMethods } from '../compat/dsh';

// DSH runtime services are injected by Cordis and checked by capability.
type DshContext = Context & Record<string, any>;
interface SessionRequest { sessionId: string }
export const name = 'archside';
export const inject = ['tools', 'sessions', 'agents', 'workingDirectory', 'systemPrompt', 'typert'];

export function apply(context: Context) {
  const ctx = context as DshContext;
  requireDshMethods(DshProtocol, ['Remote', 'TypertRemoteService'], '远程协议接口');
  requireDshMethods(DshTools, ['defineTool'], 'Agent 工具定义接口');
  requireDshMethods(ctx, ['effect', 'plugin', 'on'], '插件生命周期接口');
  for (const [service, methods] of Object.entries({
    tools: ['register'], sessions: ['get'], agents: ['get'],
    workingDirectory: ['ensure'], systemPrompt: ['section'], typert: ['register'],
  })) requireDshMethods(ctx[service], methods, `宿主服务 ${service}`);
  const { Remote, TypertRemoteService } = DshProtocol;
  const { defineTool } = DshTools;
  const repository = new ArchitectureRepository();
  const references = new Map<string, Map<string, string>>();
  ctx.effect(() => () => { repository.close(); references.clear(); });
  async function rootFor(sessionId: string): Promise<string> {
    if (typeof sessionId !== 'string' || !sessionId) throw new Error('会话 ID 无效');
    const agent = ctx.agents.get(sessionId as Parameters<typeof ctx.agents.get>[0]);
    if (agent) return ctx.workingDirectory.ensure(agent);
    const session = ctx.sessions.get(sessionId as Parameters<typeof ctx.sessions.get>[0]);
    if (!session?.header.cwd) throw new Error('请先在 DSH 中打开项目并创建对话');
    return session.header.cwd;
  }
  class ArchsideRemote extends TypertRemoteService {
    constructor(remoteContext: Context) { super(remoteContext, 'archside'); }
    @Remote('snapshot')
    async snapshot(request: SessionRequest) { return repository.snapshot(await rootFor(request.sessionId)); }
    @Remote('saveLayout')
    async saveLayout(request: SessionRequest & { layout: unknown }) { return repository.saveLayout(await rootFor(request.sessionId), request.layout); }
    @Remote('reference')
    async reference(request: SessionRequest & { id: string }) {
      const snap = await repository.snapshot(await rootFor(request.sessionId));
      const n = snap.architecture?.nodes.find(n => n.id === request.id);
      if (!n) throw new Error('节点已被移除，请刷新架构图');
      const refs = references.get(request.sessionId) ?? new Map<string, string>();
      refs.set(n.number, n.id); references.set(request.sessionId, refs);
      return { text: `@(${n.number} ${n.title})`, id: n.id };
    }
    @Remote('asset')
    async asset(request: SessionRequest & { path: string }) { return repository.asset(await rootFor(request.sessionId), request.path); }
  }
  ctx.plugin(ArchsideRemote);
  ctx.effect(() => ctx.typert.register({ package: ARCHSIDE_REMOTE.package, face: 'host', schemas: [],
    model: { services: [], events: [], objects: [] }, invocations: ARCHSIDE_REMOTE.descriptors }), 'archside.remote-schema');
  ctx.systemPrompt.section({ name: 'archside', order: 85, text: AGENT_GUIDE });
  const output = { schema: { type: 'string' as const }, render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }] };
  const stringify = (value: unknown) => JSON.stringify(value, null, 2);
  ctx.tools.register(defineTool({
    name: 'archside_read', description: 'Read the current project architecture Markdown, stable IDs, revision and synchronization state. If missing, scan the code or analyze requirements and create an initial design using archside_publish. Never invent implementation evidence.',
    parameters: {}, output,
    async execute(_args, exec) {
      if (!exec.agent) throw new Error('此工具需要项目对话');
      const snap = await repository.snapshot(await rootFor(exec.agent.id), true);
      return stringify({ path: snap.path, revision: snap.revision, markdown: snap.markdown, architecture: snap.architecture, stale: snap.stale, error: snap.error ?? null, format: FORMAT_GUIDE });
    },
  }));
  ctx.tools.register(defineTool({
    name: 'archside_context', description: 'Resolve @ architecture references to stable nodes, descendants, direct connections and source file paths. Omit nodes for clicked references; otherwise use stable IDs or displayed numbers. Search a source file or function using query. References identify the operation target, not permission to change every connected node.',
    parameters: { nodes: { type: 'array', items: { type: 'string' }, description: 'Stable node IDs or numbers from @ references.' }, query: { type: 'string', description: 'Search node titles, bodies and linked source file paths.' } }, output,
    async execute(args, exec) {
      if (!exec.agent) throw new Error('此工具需要项目对话');
      const snap = await repository.snapshot(await rootFor(exec.agent.id), true); const doc = snap.architecture;
      if (!doc) return stringify({ missing: true, guidance: '先扫描代码或分析需求，再生成架构 MD。' });
      const refs = references.get(exec.agent.id);
      const ids = args.nodes?.map(key => refs?.get(key) ?? doc.nodes.find(n => n.id === key || n.number === key)?.id).filter((id): id is string => !!id) ?? [...(refs?.values() ?? [])];
      if (args.query) for (const n of doc.nodes) if (`${n.title}\n${n.body}\n${n.files.join('\n')}`.toLowerCase().includes(args.query.toLowerCase())) ids.push(n.id);
      return stringify({ revision: snap.revision, ...nodeContext(doc, [...new Set(ids)]) });
    },
  }));
  ctx.tools.register(defineTool({
    name: 'archside_publish', description: 'Validate and atomically publish the COMPLETE architecture Markdown, preserving stable IDs and updating edges for actual structural changes. Read first and pass its revision to prevent overwriting concurrent edits. Call after program changes and checks are finished. The final chat reply MUST state whether architecture, program, both, or neither changed.',
    parameters: {
      markdown: { type: 'string', required: true, description: 'Complete architecture.md using the ArchSide format from archside_read.' },
      expectedRevision: { type: 'string', required: true, description: 'Revision from the latest archside_read; empty string only when the file does not exist.' },
      scope: { type: 'string', required: true, enum: ['architecture', 'architecture-and-code'], description: 'What actually changed: architecture alone or architecture plus program.' },
      summary: { type: 'string', required: true, description: 'User-facing description of actual changes, in the conversation language.' },
    }, output,
    async execute(args, exec) {
      if (!exec.agent) throw new Error('此工具需要项目对话');
      const snap = await repository.publish(await rootFor(exec.agent.id), args.markdown, args.expectedRevision, args.scope, args.summary);
      return stringify({ saved: snap.path, revision: snap.revision, nodes: snap.architecture?.nodes.length, scope: args.scope, summary: args.summary, replyReminder: '请在最终对话回复明确说明修改了架构图，还是架构图与程序一起修改。' });
    },
  }));
  ctx.tools.register(defineTool({
    name: 'archside_focus', description: 'Reveal and highlight a node in the architecture sidebar. First find its stable ID with archside_context. The client navigates to the owning chapter; other chapters remain boundary references.',
    parameters: { id: { type: 'string', required: true, description: 'Stable node ID.' } }, output,
    async execute(args, exec) { if (!exec.agent) throw new Error('此工具需要项目对话'); return stringify(await repository.focus(await rootFor(exec.agent.id), args.id)); },
  }));
  ctx.on('session/event', (session: any, event: any) => {
    if (event.type !== 'turn/start' && event.type !== 'turn/end') return;
    rootFor(session.id).then(root => repository.setBusy(root, session.id, event.type === 'turn/start')).catch(error => ctx.logger.warn(`ArchSide: ${String(error)}`));
  });
  ctx.on('agent/disposed', ({ agent }: any) => {
    references.delete(agent.id);
    rootFor(agent.id).then(root => repository.setBusy(root, agent.id, false)).catch(() => {});
  });
}
