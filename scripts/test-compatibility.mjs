import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import semver from 'semver';

// Each version gets its own dependencies and source copy; never change the user's DSH profile.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const versions = process.argv.slice(2);
if (!versions.length) versions.push('0.2.1-rc.2', '0.2.1-rc.3');
for (const version of versions) assert.ok(semver.valid(version), `Expected an exact DSH version: ${version}`);
await mkdir(join(root, '.cache'), { recursive: true });
const runRoot = await mkdtemp(join(root, '.cache', 'compatibility-'));
console.log(`Isolated compatibility workspaces: ${runRoot}`);

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', windowsHide: true });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} exited ${code}`)));
  });
}

function npm(args, cwd) {
  return process.platform === 'win32'
    ? run(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm.cmd', ...args], cwd)
    : run('npm', args, cwd);
}

const results = [];
for (const version of versions) {
  const cwd = join(runRoot, version);
  await mkdir(cwd);
  for (const path of ['src', 'tests', 'examples', 'scripts', 'tsconfig.json']) {
    await cp(join(root, path), join(cwd, path), { recursive: true });
  }
  const fixture = structuredClone(manifest);
  // Pin every direct DSH SDK dependency to the version under test, keeping peers consistent.
  for (const name of Object.keys(fixture.devDependencies)) {
    if (name.startsWith('@deepseek-ai/dsh-')) fixture.devDependencies[name] = version;
  }
  fixture.devDependencies['@deepseek-ai/dsh-app-boot'] = version;
  await writeFile(join(cwd, 'package.json'), JSON.stringify(fixture, null, 2) + '\n');
  await writeFile(join(cwd, 'check-runtime.mjs'), `
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { evaluatePluginCompatibility } from '@deepseek-ai/dsh-app-boot';
const manifest = JSON.parse(await readFile('package.json', 'utf8'));
assert.equal(evaluatePluginCompatibility(manifest, {}, ${JSON.stringify(version)}), undefined);
// Synthetic versions check admission only; they do not claim SDK/runtime support.
for (const version of ['0.1.0', '0.2.1-rc.1', '0.3.0-alpha.1', '1.0.0', '99.0.0-rc.1']) {
  assert.equal(evaluatePluginCompatibility(manifest, {}, version), undefined, version);
  const { engines, ...peerOnly } = manifest;
  assert.equal(evaluatePluginCompatibility(peerOnly, {}, version), undefined, 'peer fallback: ' + version);
}
console.log('Official DSH compatibility evaluator confirmed no version gate (including prereleases).');
`);
  console.log(`\nChecking DSH ${version}`);
  await npm(['install', '--ignore-scripts', '--no-audit', '--no-fund', '--fetch-retries=0', '--fetch-timeout=30000'], cwd);
  await run(process.execPath, ['check-runtime.mjs'], cwd);
  await npm(['run', 'check'], cwd);
  await npm(['run', 'verify:package'], cwd);
  results.push({ version, passed: true });
  await writeFile(join(runRoot, 'results.json'), JSON.stringify(results, null, 2) + '\n');
}
console.log(`DSH compatibility passed: ${versions.join(', ')}`);
