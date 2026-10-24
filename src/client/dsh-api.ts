import type { ArchsideApi } from './api';
import { DshCapabilityError, optionalDshService, requireDshMethods } from '../compat/dsh';

export async function unwrap(call: Promise<any>) {
  const result = await call;
  if (!result || typeof result.ok !== 'boolean') throw new DshCapabilityError('远程调用结果接口');
  if (!result.ok) throw new Error(result.error?.message || 'ArchSide 请求失败');
  return result.value;
}

/** Capability-based adapter. All draft writes go through DSH's composer API. */
export function sessionApi(ctx: any, sessionId: string): ArchsideApi {
  const insertPrompt = async (text: string) => {
    const input = optionalDshService(ctx, 'conversation')?.input;
    requireDshMethods(input, ['shell'], '输入框接口');
    const shell = input.shell(sessionId);
    requireDshMethods(shell, ['insertText', 'focus'], '输入框接口');
    const snapshot = shell?.snapshot;
    if (typeof snapshot?.draft !== 'string' || !Number.isFinite(snapshot?.draftRev)) {
      throw new DshCapabilityError('输入框接口');
    }
    const { draft, draftRev } = snapshot;
    const suffix = `${draft && !/\s$/.test(draft) ? ' ' : ''}${text} `;
    if (!shell.insertText(suffix, { start: draft.length, end: draft.length, draftRev })) throw new Error('输入框内容已变化，请再次选择节点');
    shell.focus();
  };
  const call = (method: string, request: Record<string, unknown>) => {
    const remote = ctx.remote?.archside;
    requireDshMethods(remote, [method], `远程接口 archside.${method}`);
    return unwrap(remote[method](request));
  };
  return {
    snapshot: async () => call('snapshot', { sessionId }),
    saveLayout: async layout => call('saveLayout', { sessionId, layout }),
    reference: async id => { const ref = await call('reference', { sessionId, id }); await insertPrompt(ref.text); },
    insertPrompt,
    asset: async path => (await call('asset', { sessionId, path })).data,
  };
}
