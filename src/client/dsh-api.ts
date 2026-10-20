import type { ArchsideApi } from './api';

export async function unwrap(call: Promise<any>) {
  const result = await call;
  if (!result.ok) throw new Error(result.error?.message || 'ArchSide 请求失败');
  return result.value;
}

/** Version-specific adapter. All draft writes go through DSH's composer API. */
export function sessionApi(ctx: any, sessionId: string): ArchsideApi {
  const insertPrompt = async (text: string) => {
    const shell = ctx.conversation.input.shell(sessionId);
    const { draft, draftRev } = shell.snapshot;
    const suffix = `${draft && !/\s$/.test(draft) ? ' ' : ''}${text} `;
    if (!shell.insertText(suffix, { start: draft.length, end: draft.length, draftRev })) throw new Error('输入框内容已变化，请再次选择节点');
    shell.focus();
  };
  return {
    snapshot: () => unwrap(ctx.remote.archside.snapshot({ sessionId })),
    saveLayout: layout => unwrap(ctx.remote.archside.saveLayout({ sessionId, layout })),
    reference: async id => { const ref = await unwrap(ctx.remote.archside.reference({ sessionId, id })); await insertPrompt(ref.text); },
    insertPrompt,
    asset: async path => (await unwrap(ctx.remote.archside.asset({ sessionId, path }))).data,
  };
}
