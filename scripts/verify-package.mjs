import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import * as host from '../dist/host.js';

assert.equal(typeof host.apply, 'function');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  await page.addScriptTag({ path: 'node_modules/react/umd/react.production.min.js' });
  await page.addScriptTag({ path: 'node_modules/react-dom/umd/react-dom.production.min.js' });
  await page.evaluate(() => {
    window.__ModuleLoader__ = { load({ id, factory }) {
      if (id !== 'dsh-plugin-archside') throw new Error('Wrong module ID');
      window.archsidePlugin = factory(name => {
        if (name === 'react') return window.React;
        if (name === 'react/jsx-runtime') return { jsx: (type, props, key) => window.React.createElement(type, { ...props, key }), jsxs: (type, props, key) => window.React.createElement(type, { ...props, key }), Fragment: window.React.Fragment };
        throw new Error(`Unexpected client external: ${name}`);
      });
    } };
  });
  await page.addScriptTag({ content: await readFile('dist/client.js', 'utf8') });
  const result = await page.evaluate(async () => {
    const client = window.archsidePlugin;
    if (typeof client.apply !== 'function' || client.inject.includes('remote.archside')) throw new Error('Client entry or Remote mount dependency is invalid');
    const slots = [], types = [], disposers = []; let mounted = false, snapshotReads = 0;
    const namespace = { snapshot: async () => {
      snapshotReads++;
      return { ok: true, value: { architecture: null, markdown: '', revision: '', layout: { version: 1, views: {} }, path: 'architecture.md', busy: false, stale: false } };
    } };
    await client.apply({
      remote: {
        get archside() { throw new Error('cannot get property "remote.archside" without inject'); },
        async $mount(contribution) { if (contribution.descriptors.length !== 4) throw new Error('Missing Remote methods'); mounted = true; return () => { mounted = false; }; },
      },
      inject(dependencies, register) {
        if (!mounted || !dependencies.includes('remote.archside')) throw new Error('UI must follow the mounted Remote namespace');
        register({ ...this, remote: { archside: namespace } });
      },
      effect(fn) { const dispose = fn(); if (typeof dispose === 'function') disposers.push(dispose); return dispose; },
      sidebarRightTabs: { register(spec) { types.push(spec); return () => {}; } },
      slots: { inject(_name, fn) { return fn(); }, register(spec, component) { slots.push({ spec, component }); return () => {}; } },
    });
    const registered = mounted && types[0]?.kind === 'archside'
      && slots.some(s => s.spec.name === 'sidebar.right.pane.tab' && s.spec.key === 'dsh-plugin-archside')
      && slots.some(s => s.spec.name === 'conversation.session.header.actions');
    const element = document.createElement('div'); document.body.append(element);
    const root = window.ReactDOM.createRoot(element);
    root.render(window.React.createElement(slots.find(s => s.spec.name === 'sidebar.right.pane.tab').component, { sessionId: 'package-test' }));
    await new Promise(resolve => setTimeout(resolve, 80));
    const connected = snapshotReads > 0 && !element.textContent.includes('without inject');
    root.unmount();
    for (const dispose of disposers.reverse()) await dispose();
    return { registered, connected, disposed: !mounted };
  });
  assert.deepEqual(result, { registered: true, connected: true, disposed: true });
} finally { await browser.close(); }
console.log('Verified built host import, DSH module loader, Remote mount/disposal and sidebar slot registration.');
