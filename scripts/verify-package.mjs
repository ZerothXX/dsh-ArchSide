import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { Context } from '@deepseek-ai/cordis';
import Registry from '@deepseek-ai/dsh-typert-registry';
import Gateway from '@deepseek-ai/dsh-api-gateway';
import { verifyBuild } from './build-integrity.mjs';
import { colorFixture, colorIds } from './color-fixture.mjs';

// An optional extracted TGZ root verifies the actual delivery, rather than just local dist.
const packageRoot = resolve(process.argv[2] || '.');
const hasSources = await access(join(packageRoot, 'src')).then(() => true, () => false);
const build = await verifyBuild(packageRoot, hasSources);
const hostPlugin = await import(pathToFileURL(join(packageRoot, 'dist/host.js')).href);
assert.equal(typeof hostPlugin.apply, 'function');
const fixture = colorFixture(10);
const workspace = await mkdtemp(join(tmpdir(), 'archside-package-'));
const host = new Context();
let snapshot;
try {
  await writeFile(join(workspace, 'architecture.md'), fixture.markdown);
  const tools = new Map();
  host.provide('tools', { register(tool) { tools.set(tool.name, tool); } });
  host.provide('sessions', { get: () => ({ header: { cwd: workspace } }) });
  host.provide('agents', { get: () => undefined });
  host.provide('workingDirectory', { ensure: () => workspace });
  host.provide('systemPrompt', { section() {} });
  host.provide('remoteAccess', { decide: () => ({ kind: 'deny', reason: 'test' }) });
  await host.plugin(Registry); await host.plugin(Gateway, {}); await host.plugin(hostPlugin);
  const read = JSON.parse(await tools.get('archside_read').execute({}, { agent: { id: 'package-test' } }));
  const chapters = read.architecture.nodes.filter(n => n.depth === 1);
  assert.equal(chapters.length, 10, 'Independent chapters must never be merged');
  assert.deepEqual(chapters.slice(0, 8).map(n => n.color), colorIds);
  assert.deepEqual(chapters.map(n => n.color), fixture.expectedColors, 'Actual host bundle must override legacy five-color metadata');
  assert.equal(read.architecture.edges.length, fixture.edges.length);
  snapshot = { ...read, layout: { version: 1, views: {} }, busy: false, stale: false };
} finally {
  await host.fiber.dispose();
  await rm(workspace, { recursive: true, force: true });
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
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
  await page.addScriptTag({ content: await readFile(join(packageRoot, 'dist/client.js'), 'utf8') });
  const result = await page.evaluate(async ({ snapshot, version }) => {
    const client = window.archsidePlugin;
    if (typeof client.apply !== 'function' || client.inject.includes('remote.archside') || client.inject.includes('conversation')) throw new Error('Client entry or optional dependency is invalid');
    const slots = [], types = [], disposers = []; let mounted = false, snapshotReads = 0, jobs = 0;
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker { postMessage(...args) { jobs++; return super.postMessage(...args); } };
    const namespace = { snapshot: async () => { snapshotReads++; return { ok: true, value: snapshot }; } };
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
      sidebarRight: { openTabIn() {} },
      slots: { inject(_name, fn) { return fn(); }, register(spec, component) { slots.push({ spec, component }); return () => {}; } },
    });
    const registered = mounted && types[0]?.kind === 'archside'
      && slots.some(s => s.spec.name === 'sidebar.right.pane.tab' && s.spec.key === 'dsh-plugin-archside')
      && slots.some(s => s.spec.name === 'conversation.session.header.actions');
    document.body.style.margin = '0';
    const element = document.createElement('div'); element.style.height = '900px'; document.body.append(element);
    const render = async sessionId => {
      const root = window.ReactDOM.createRoot(element);
      root.render(window.React.createElement(slots.find(s => s.spec.name === 'sidebar.right.pane.tab').component, { sessionId }));
      for (let i = 0; i < 150 && (element.querySelectorAll('.as-node').length !== 10
        || element.querySelector('[data-testid="graph-surface"]')?.getAttribute('aria-busy') !== 'false'); i++) await new Promise(resolve => setTimeout(resolve, 20));
      return root;
    };
    const root = await render('package-test');
    const connected = snapshotReads > 0 && !element.textContent.includes('without inject');
    const graphWorker = jobs > 0 && element.querySelectorAll('.as-node').length === 10;
    const versionMatches = element.querySelector('.as-header-label')?.textContent.includes(`v${version}`) === true;
    const inks = [...element.querySelectorAll('.as-node')].map(e => e.style.getPropertyValue('--node-ink'));
    const eightColors = new Set(inks.slice(0, 8)).size === 8 && new Set(inks).size === 8;
    const markers = [...element.querySelectorAll('.as-edges marker')];
    const eightArrowColors = markers.length === 8 && new Set(markers.map(e => e.querySelector('path').getAttribute('fill'))).size === 8;
    root.unmount();
    window.Worker = class { constructor() { throw new Error('Worker disabled by host'); } };
    const fallback = await render('fallback-test');
    const fallbackGraph = element.querySelectorAll('.as-node').length === 10;
    window.__disposePackage = async () => {
      fallback.unmount(); window.Worker = NativeWorker;
      for (const dispose of disposers.reverse()) await dispose();
      return !mounted;
    };
    return { registered, connected, graphWorker, fallbackGraph, versionMatches, eightColors, eightArrowColors };
  }, { snapshot, version: build.version });
  assert.deepEqual(result, { registered: true, connected: true, graphWorker: true, fallbackGraph: true, versionMatches: true, eightColors: true, eightArrowColors: true });
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: `artifacts/package-${build.version}-colors.png` });
  assert.equal(await page.evaluate(() => window.__disposePackage()), true);
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
console.log(`Verified ${build.version}: source/build hashes, actual host parsing of ten legacy-colored chapters, eight-color client rendering/arrowheads, matching UI version, DSH module loader, Remote mount/disposal and worker fallback. Package root: ${packageRoot}`);
