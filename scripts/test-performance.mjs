import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const workspace = await mkdtemp(path.join(tmpdir(), 'archside-performance-'));
const count = 120, edges = [];
let markdown = '# Large architecture\n\nInteraction regression fixture.\n';
for (let c = 0; c < 6; c++) {
  markdown += `## ${c + 1} Module ${c + 1}\n<!-- archside: {"id":"chapter-${c}"} -->\n`;
  for (let s = 0; s < 20; s++) {
    const i = c * 20 + s;
    markdown += `### ${c + 1}.${s + 1} Component ${i}\n<!-- archside: {"id":"node-${i}"} -->\nComponent description.\n`;
    if (s > 0) edges.push({ id: `flow-${i}`, source: `node-${i - 1}`, target: `node-${i}`, label: 'flow' });
    if (c > 0 && s % 5 === 0) edges.push({ id: `cross-${i}`, source: `node-${i - 20}`, target: `node-${i}`, label: 'cross' });
  }
}
markdown += '```archside\n' + JSON.stringify({ edges }) + '\n```\n';
await writeFile(path.join(workspace, 'architecture.md'), markdown);
const port = 4182;
const server = spawn(process.execPath, ['--import', 'tsx', 'scripts/preview.mjs'], {
  env: { ...process.env, PORT: String(port), ARCHSIDE_PREVIEW_WORKSPACE: workspace },
  stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
});
let serverLog = ''; server.stdout.on('data', c => serverLog += c); server.stderr.on('data', c => serverLog += c);
let browser;
try {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/api/snapshot`)).ok) break; } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1512, height: 982 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    sessionStorage.setItem('archside:nav:preview', JSON.stringify({ chapter: null, detail: null, detailed: true }));
    window.graphJobs = 0;
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      postMessage(...args) { window.graphJobs++; return super.postMessage(...args); }
    };
    window.framesMeasured = [];
    let last = 0;
    const frame = now => { if (last) window.framesMeasured.push(now - last); last = now; requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
  });
  await page.goto(`http://127.0.0.1:${port}`);
  const settled = () => page.waitForFunction(() => document.querySelector('[data-testid="graph-surface"]')?.getAttribute('aria-busy') === 'false', undefined, { timeout: 120000 });
  await page.getByTestId('node-node-0').waitFor({ timeout: 120000 }); await settled();
  assert.equal(await page.locator('.as-node').count(), count);
  assert.equal(await page.locator('[data-relationship="explicit"]').count(), edges.length);
  assert.equal(await page.locator('[data-relationship="structural"]').count(), 0);
  // Give the worker initialization / font loading time to settle before measuring interaction.
  await page.waitForTimeout(400);
  const jobs = await page.evaluate(() => window.graphJobs);
  assert.ok(jobs > 0, 'full routing must run in a real background worker');
  const graph = page.getByTestId('graph-surface'), box = await graph.boundingBox();
  await page.evaluate(() => { window.framesMeasured = []; });
  await page.mouse.move(box.x + box.width - 80, box.y + box.height - 30);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 20, box.y + box.height - 60, { steps: 45 });
  await page.mouse.up();
  await settled();
  const node = page.getByTestId('node-node-0');
  const position = await node.evaluate(e => [e.style.left, e.style.top]);
  const nodeBox = await node.boundingBox(), x = nodeBox.x + nodeBox.width * .3, y = nodeBox.y + nodeBox.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  for (let i = 1; i <= 45; i++) {
    await page.mouse.move(x + i, y + i / 2);
    await page.waitForTimeout(8);
  }
  const duringDragJobs = await page.evaluate(() => window.graphJobs);
  assert.equal(duringDragJobs, jobs, 'pointer moves and snapshot polling must not reroute the graph');
  assert.notEqual(await node.evaluate(e => e.style.transform), '', 'node preview should move before the routing job');
  await page.mouse.up();
  await settled();
  assert.notDeepEqual(await node.evaluate(e => [e.style.left, e.style.top]), position);
  assert.equal(await page.evaluate(() => window.graphJobs), jobs + 1, 'one routing job after release');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -100); await page.waitForTimeout(100);
  await page.mouse.wheel(0, 100); await page.waitForTimeout(100);
  await page.waitForTimeout(2800);
  assert.equal(await page.evaluate(() => window.graphJobs), jobs + 1, 'zoom and unchanged polls must reuse geometry');
  const metrics = await page.evaluate(() => {
    const frames = window.framesMeasured.sort((a, b) => a - b);
    return { frames: frames.length, p95FrameMs: frames[Math.floor(frames.length * .95)], maxFrameMs: frames.at(-1), routingJobs: window.graphJobs };
  });
  assert.ok(metrics.p95FrameMs < 80, `Interaction frame budget exceeded: ${JSON.stringify(metrics)}`);
  assert.deepEqual(errors, []);
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/performance-120-nodes.png' });
  await writeFile('artifacts/performance-result.json', JSON.stringify({ nodes: count, relationships: edges.length, ...metrics }, null, 2));
  console.log(JSON.stringify({ nodes: count, relationships: edges.length, ...metrics }));
} catch (error) { console.error(serverLog); throw error; }
finally { await browser?.close(); server.kill(); await new Promise(r => server.once('exit', r)); await rm(workspace, { recursive: true, force: true }); }
