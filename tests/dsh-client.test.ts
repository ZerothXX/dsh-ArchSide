import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionApi } from '../src/client/dsh-api';

test('DSH adapter appends multiple references without sending or replacing the existing draft', async () => {
  let draft = '请分析'; let draftRev = 7; let focused = 0;
  const shell = {
    get snapshot() { return { draft, draftRev }; },
    insertText(text: string, span: { start: number; end: number; draftRev: number }) {
      assert.equal(span.draftRev, draftRev); assert.equal(span.start, draft.length); assert.equal(span.end, draft.length);
      draft += text; draftRev++; return true;
    },
    focus() { focused++; },
  };
  const api = sessionApi({
    conversation: { input: { shell: (id: string) => { assert.equal(id, 'session-a'); return shell; } } },
    remote: { archside: { reference: async ({ sessionId, id }: { sessionId: string; id: string }) => {
      assert.equal(sessionId, 'session-a'); return { ok: true, value: { text: `@(1.${id} 节点${id})`, id } };
    } } },
  }, 'session-a');
  await api.reference('1'); await api.reference('2');
  assert.equal(draft, '请分析 @(1.1 节点1) @(1.2 节点2) '); assert.equal(focused, 2);
});

test('failed or stale references report an error without a fallback draft overwrite', async () => {
  let focused = false;
  const api = sessionApi({
    conversation: { input: { shell: () => ({ snapshot: { draft: 'keep', draftRev: 1 }, insertText: () => false, focus: () => { focused = true; } }) } },
    remote: { archside: { reference: async ({ id }: { id: string }) => id === 'missing' ? { ok: false, error: { message: '节点已移除' } } : { ok: true, value: { text: '@(1 Test)' } } } },
  }, 'session-a');
  await assert.rejects(api.reference('missing'), /节点已移除/);
  await assert.rejects(api.reference('present'), /输入框内容已变化/);
  assert.equal(focused, false);
});
