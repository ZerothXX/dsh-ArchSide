import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import Registry from '@deepseek-ai/dsh-typert-registry';
import Gateway from '@deepseek-ai/dsh-api-gateway';
import * as ClientGateway from '@deepseek-ai/dsh-api-gateway/client';
import { ARCHSIDE_REMOTE } from '../src/core/remote';
import * as plugin from '../src/host/index';

test('real DSH Gateway connects mounted client namespace to host tools and workspace', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'archside-host-'));
  const host = new Context() as Context & Record<string, any>;
  const client = new Context() as Context & Record<string, any>;
  try {
    await copyFile(new URL('../examples/architecture.md', import.meta.url), join(workspace, 'architecture.md'));
    const tools = new Map<string, any>(); let guide = '';
    host.provide('tools', { register(tool: any) { tools.set(tool.name, tool); } });
    host.provide('sessions', { get: (id: string) => id === 'session-a' ? { header: { cwd: workspace } } : undefined });
    host.provide('agents', { get: () => undefined });
    host.provide('workingDirectory', { ensure: () => workspace });
    host.provide('systemPrompt', { section: (spec: any) => { guide = spec.text; } });
    host.provide('remoteAccess', { decide: () => ({ kind: 'deny', reason: 'test' }) });
    await host.plugin(Registry);
    await host.plugin(Gateway, {});
    const fiber = host.plugin(plugin); await fiber;
    assert.equal(tools.size, 4); assert.match(guide, /archside_publish/);
    assert.equal(host.typert.local.list().length, 4);
    const peer: any = { id: 'test-peer', ctx: host, principal: { kind: 'owner' }, signal: new AbortController().signal, interactions: 'none', dispose: async () => {} };
    client.provide('connection', {
      interactions: 'none',
      rpc: {
        open: () => { throw new Error('No streams needed in this test'); },
        call: async (_path: string, endpoint: string, payload: any) => {
          const [namespace, method] = endpoint.split('/');
          try { return { ok: true, value: await host.typertGateway.invoke({ namespace, method, args: payload.args, peer }) }; }
          catch (error) { return { ok: false, error: { code: 'test/failure', message: (error as Error).message, details: {} } }; }
        },
      },
    });
    await client.plugin(Registry); await client.plugin(ClientGateway);
    const remote: any = client.get('remote');
    const unmount = await remote.$mount(ARCHSIDE_REMOTE);
    const snap = await remote.archside.snapshot({ sessionId: 'session-a' });
    assert.equal(snap.ok, true); assert.ok(snap.value.architecture.nodes.length > 15);
    const ref = await remote.archside.reference({ sessionId: 'session-a', id: 'markdown' });
    assert.equal(ref.value.text, '@(1.1 架构 Markdown)');
    const exec = { agent: { id: 'session-a' } };
    const context = JSON.parse(await tools.get('archside_context').execute({}, exec));
    assert.equal(context.selected[0].id, 'markdown');
    assert.ok(context.descendants.some((n: any) => n.id === 'heading-format'));
    const focus = JSON.parse(await tools.get('archside_focus').execute({ id: 'heading-format' }, exec));
    assert.equal(focus.focused, 'heading-format');
    assert.equal((await remote.archside.snapshot({ sessionId: 'session-a' })).value.focus.id, 'heading-format');
    const invalid = await remote.archside.snapshot({ sessionId: 'unknown' });
    assert.equal(invalid.ok, false);
    assert.throws(() => ARCHSIDE_REMOTE.methods['archside/snapshot'].input().create().parse({ request: { sessionId: '' } }));
    await unmount(); await fiber.dispose();
    assert.equal(host.typert.local.list().length, 0);
  } finally {
    await client.fiber.dispose(); await host.fiber.dispose();
    await rm(workspace, { recursive: true, force: true });
  }
});
