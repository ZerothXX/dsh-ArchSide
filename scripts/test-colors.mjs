import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { PALETTE } from '../src/core/model.ts';
import { parseMarkdown } from '../src/core/markdown.ts';

await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const count of [8, 9]) {
    const workspace = await mkdtemp(path.join(tmpdir(), 'archside-colors-'));
    const chapters = Array.from({ length: count }, (_, i) =>
      `## ${i + 1} 模块 ${i + 1}\n<!-- archside: {"id":"chapter-${i}","color":"blue"} -->\n### ${i + 1}.1 内部结构\n<!-- archside: {"id":"section-${i}"} -->\n`).join('\n');
    const edges = count === 8
      ? Array.from({ length: count }, (_, i) => ({ id: `edge-${i}`, source: `section-${i}`, target: `section-${(i + 1) % count}`, kind: 'data', label: '' }))
      : Array.from({ length: count }, (_, a) => Array.from({ length: count - a - 1 }, (_, i) => {
        const b = a + i + 1;
        return a === 0 && b === 8 ? [] : [{ id: `edge-${a}-${b}`, source: `section-${a}`, target: `section-${b}`, kind: 'data', label: '' }];
      }).flat()).flat();
    const markdown = `# ${count} 个结构部分的配色\n${chapters}\n\`\`\`archside\n${JSON.stringify({ version: 1, edges })}\n\`\`\`\n`;
    const expected = parseMarkdown(markdown);
    await writeFile(path.join(workspace, 'architecture.md'), markdown);
    const port = 4183;
    const server = spawn(process.execPath, ['--import', 'tsx', 'scripts/preview.mjs'], {
      env: { ...process.env, PORT: String(port), ARCHSIDE_PREVIEW_WORKSPACE: workspace },
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });
    let serverLog = ''; server.stdout.on('data', chunk => serverLog += chunk); server.stderr.on('data', chunk => serverLog += chunk);
    let page;
    try {
      let ready = false;
      for (let i = 0; i < 60; i++) {
        try { if ((await fetch(`http://127.0.0.1:${port}/api/snapshot`)).ok) { ready = true; break; } } catch {}
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      assert.ok(ready, `Preview startup failed: ${serverLog}`);
      page = await browser.newPage({ viewport: { width: 1512, height: 982 }, deviceScaleFactor: 1 });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      await page.goto(`http://127.0.0.1:${port}`);
      const settled = async () => {
        await page.getByTestId('node-chapter-0').or(page.getByTestId('node-section-0')).waitFor();
        await page.waitForFunction(() => document.querySelector('[data-testid="graph-surface"]')?.getAttribute('aria-busy') === 'false');
      };
      await settled();
      const verify = async depth => {
        assert.equal(await page.locator('.as-node').count(), count);
        const inks = [];
        for (const node of expected.nodes.filter(node => node.depth === depth)) {
          const ink = PALETTE.find(color => color.id === node.color).ink;
          const actual = await page.getByTestId(`node-${node.id}`).evaluate(element => getComputedStyle(element).getPropertyValue('--node-ink').trim());
          assert.equal(actual, ink); inks.push(actual);
        }
        assert.equal(new Set(inks).size, 8);
        assert.equal(await page.locator('.as-edges marker').count(), 8);
        const arrows = await page.locator('.as-edges g[data-relationship="explicit"] > path').evaluateAll(paths => paths.map(element => {
          const markerId = element.getAttribute('marker-end').slice(5, -1);
          return { stroke: element.getAttribute('stroke'), fill: document.getElementById(markerId)?.querySelector('path')?.getAttribute('fill') };
        }));
        assert.equal(arrows.length, edges.length);
        for (const arrow of arrows) assert.equal(arrow.stroke, arrow.fill, 'Every relationship arrow must match its source color');
        const legend = await page.locator('.as-legend > span:not(.as-structure-key) i').evaluateAll(elements => elements.map(element => element.style.background));
        assert.equal(new Set(legend).size, 8);
      };
      await verify(1);
      if (count === 9) {
        const ink = id => page.getByTestId(`node-chapter-${id}`).evaluate(element => element.style.getPropertyValue('--node-ink'));
        assert.equal(await ink(0), await ink(8), 'Only the disconnected pair should share a color');
      }
      await page.screenshot({ path: `artifacts/${count}-chapter-colors.png` });
      await page.getByRole('button', { name: '详细', exact: true }).click();
      await page.getByTestId('node-section-0').waitFor();
      await settled();
      await verify(2);
      assert.deepEqual(errors, []);
    } finally {
      await page?.close();
      const exited = new Promise(resolve => server.once('exit', resolve));
      if (server.exitCode === null && server.signalCode === null) { server.kill(); await exited; }
      assert.ok(path.resolve(workspace).startsWith(path.join(path.resolve(tmpdir()), 'archside-colors-')));
      await rm(workspace, { recursive: true, force: true });
    }
  }
} finally { await browser.close(); }
console.log('Verified eight distinct chapter colors, disconnected-pair reuse, descendant inheritance, legends and all colored arrowheads in both overview modes.');
console.log('Screenshots: artifacts/8-chapter-colors.png, artifacts/9-chapter-colors.png');
