import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Context } from '@deepseek-ai/cordis';
// @ts-expect-error semver is used only for manifest admission checks.
import semver from 'semver';
import { sessionApi } from '../src/client/dsh-api';
import { DshCapabilityError } from '../src/compat/dsh';

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

test('manifest and SDK peers do not gate DSH versions, including prereleases', () => {
  assert.equal(manifest.engines.dsh, '*');
  for (const range of [manifest.engines.dsh, ...Object.values(manifest.peerDependencies)]) {
    assert.equal(range, '*');
    for (const version of ['0.1.0', '0.2.1-rc.1', '0.2.1-rc.2', '0.2.1-rc.3', '0.3.0-alpha.1', '1.0.0', '99.0.0-rc.1']) {
      // Admission checks on synthetic versions are not claims of runtime compatibility.
      assert.equal(semver.satisfies(version, range, { includePrerelease: true }), true, version);
    }
  }
});

test('real Cordis optional composer lookup preserves graph reads and follows available capabilities', async () => {
  const ctx = new Context();
  let draft = 'existing';
  const value = { revision: 'test', architecture: null };
  ctx.provide('remote', { archside: { snapshot: async () => ({ ok: true, value }) } });
  const api = sessionApi(ctx, 'session-a');
  try {
    assert.deepEqual(await api.snapshot(), value);
    await assert.rejects(api.insertPrompt('ref'), DshCapabilityError);
    ctx.provide('conversation', { input: { shell: () => ({
      get snapshot() { return { draft, draftRev: 1 }; },
      insertText(text: string) { draft += text; return true; }, focus() {},
    }) } });
    await api.insertPrompt('ref');
    assert.equal(draft, 'existing ref ');
    ctx.set('conversation', undefined);
    await assert.rejects(api.insertPrompt('another'), DshCapabilityError);
    assert.equal(draft, 'existing ref ');
    assert.deepEqual(await api.snapshot(), value);
  } finally { await ctx.fiber.dispose(); }
});
