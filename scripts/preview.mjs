import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const { ArchitectureRepository } = await import('../src/host/repository.ts');
const repository = new ArchitectureRepository();
const root = resolve(process.env.ARCHSIDE_PREVIEW_WORKSPACE || '.');
const port = Number(process.env.PORT || 4173);
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
  const reply = (status, body, type = 'application/json; charset=utf-8') => { res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(type.startsWith('application/json') ? JSON.stringify(body) : body); };
  try {
    if (req.method === 'POST' && req.headers.origin !== `http://127.0.0.1:${port}` && req.headers.origin !== `http://localhost:${port}`) return reply(403, { error: 'Only same-origin preview requests are allowed' });
    let body = {};
    if (req.method === 'POST') { const chunks = []; let length = 0; for await (const chunk of req) { length += chunk.length; if (length > 2_000_000) throw new Error('Request too large'); chunks.push(chunk); } body = JSON.parse(Buffer.concat(chunks).toString()); }
    if (url.pathname === '/api/snapshot') return reply(200, await repository.snapshot(root));
    if (url.pathname === '/api/layout' && req.method === 'POST') return reply(200, await repository.saveLayout(root, body.layout));
    if (url.pathname === '/api/asset' && req.method === 'POST') return reply(200, await repository.asset(root, body.path));
    if (url.pathname === '/api/reference' && req.method === 'POST') { const snap = await repository.snapshot(root); const n = snap.architecture?.nodes.find(n => n.id === body.id); if (!n) return reply(404, { error: 'Node not found' }); return reply(200, { id: n.id, text: `@(${n.number} ${n.title})` }); }
    const files = { '/': ['dist/index.html', 'text/html; charset=utf-8'], '/preview.js': ['dist/preview.js', 'text/javascript; charset=utf-8'] };
    const file = files[url.pathname]; if (!file || req.method !== 'GET') return reply(404, { error: 'Not found' });
    return reply(200, await readFile(file[0]), file[1]);
  } catch (error) { reply(400, { error: error.message }); }
});
server.listen(port, '127.0.0.1', () => console.log(`ArchSide preview: http://127.0.0.1:${port}\nWorkspace: ${root}`));
process.on('SIGINT', () => { repository.close(); server.close(); });
process.on('SIGTERM', () => { repository.close(); server.close(); });
