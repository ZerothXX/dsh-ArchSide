import React, { useEffect, useMemo, useState } from 'react';
import { ArchitecturePanel } from './ArchitecturePanel';
import { Icon } from './icons';
import { ARCHSIDE_REMOTE } from '../core/remote';
import { sessionApi, unwrap } from './dsh-api';
import { requireDshMethods } from '../compat/dsh';

export const inject = ['slots', 'locale', 'sidebarRightTabs', 'sidebarRight', 'remote'];
export async function apply(ctx: any) {
  requireDshMethods(ctx, ['effect', 'inject'], '插件生命周期接口');
  requireDshMethods(ctx.remote, ['$mount'], '远程服务挂载接口');
  const unmountRemote = await ctx.remote.$mount(ARCHSIDE_REMOTE);
  ctx.effect(() => unmountRemote, 'archside.remote');
  ctx.inject(['remote.archside', ...inject], registerUi);
}

function registerUi(ctx: any) {
  requireDshMethods(ctx.sidebarRightTabs, ['register'], '侧栏标签注册接口');
  requireDshMethods(ctx.sidebarRight, ['openTabIn'], '侧栏打开接口');
  requireDshMethods(ctx.slots, ['inject', 'register'], '界面插槽接口');
  function Body({ sessionId }: { sessionId: string }) {
    const api = useMemo(() => sessionApi(ctx, sessionId), [sessionId]);
    return <ArchitecturePanel key={sessionId} api={api} sessionKey={sessionId}/>;
  }
  function Launcher({ sessionId }: { sessionId: string }) {
    const [error, setError] = useState('');
    useEffect(() => {
      let stopped = false; let timer: ReturnType<typeof setTimeout>; let seen = 0;
      async function check() {
        try { const snap = await unwrap(ctx.remote.archside.snapshot({ sessionId })); if (!stopped && snap.focus && snap.focus.nonce !== seen) { seen = snap.focus.nonce; ctx.sidebarRight.openTabIn(sessionId, 'archside'); } }
        catch { /* Panel contains full connection diagnostics when opened. */ }
        if (!stopped) timer = setTimeout(check, 2000);
      }
      void check(); return () => { stopped = true; clearTimeout(timer); };
    }, [sessionId]);
    return <button type="button" aria-label="打开项目架构图" title={error || 'ArchSide · 项目架构'} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 9px', borderRadius: 7, border: '1px solid var(--dsw-alias-border-l1, #dce5e1)', background: 'transparent', color: 'var(--dsw-alias-label-secondary, #55736b)', cursor: 'pointer', fontSize: 12 }} onClick={() => { try { ctx.sidebarRight.openTabIn(sessionId, 'archside'); setError(''); } catch (err) { setError(String(err)); } }}><Icon name="layers" size={16}/>架构</button>;
  }
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: 'dsh-plugin-archside', kind: 'archside', priority: 'extension', title: () => 'ArchSide · 项目架构',
  }), 'archside.tab-type');
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key: 'dsh-plugin-archside' }, Body)), 'archside.tab-body');
  ctx.effect(() => ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({ name: 'conversation.session.header.actions', id: 'archside.open', order: 20 }, Launcher)), 'archside.launcher');
}
