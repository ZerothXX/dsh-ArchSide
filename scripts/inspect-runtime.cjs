// Read-only inspection of the locally installed DSH contracts.
const fs = require('node:fs');
const archive = process.env.DSH_ASAR || 'D:/deepseek_harness/DeepSeek Harness/resources/app.asar';
const fd = fs.openSync(archive, 'r');
const lead = Buffer.alloc(16);
fs.readSync(fd, lead, 0, 16, 0);
const head = Buffer.alloc(lead.readUInt32LE(12));
fs.readSync(fd, head, 0, head.length, 16);
const root = JSON.parse(head.toString());
const base = 8 + lead.readUInt32LE(4);
function walk(dir, path = '') {
  for (const [name, entry] of Object.entries(dir.files || {})) {
    const file = path ? `${path}/${name}` : name;
    if (entry.files) walk(entry, file);
    else if (process.argv[2] === '--extract' ? /^dsh\/node_modules\/@deepseek-ai\/[^/]+\/(lib\/|package.json|cordis|README|skills\/cordis-plugin-development)/.test(file) && !file.includes('/node_modules/zod/') : process.argv[2] ? file.includes(process.argv[2]) : /@deepseek-ai\/.+\/(package.json|[^/]+\.d\.ts)$/.test(file)) {
      if (process.argv[2] === '--extract') {
        const dest = require('node:path').join('.cache/runtime', file.replace('dsh/node_modules/', ''));
        fs.mkdirSync(require('node:path').dirname(dest), { recursive: true });
        if (entry.unpacked) fs.copyFileSync(`${archive}.unpacked/${file}`, dest);
        else { const data = Buffer.alloc(entry.size); fs.readSync(fd, data, 0, entry.size, base + Number(entry.offset)); fs.writeFileSync(dest, data); }
        continue;
      }
      if (process.argv[3] === '--read') {
        if (entry.unpacked) process.stdout.write(fs.readFileSync(`${archive}.unpacked/${file}`, 'utf8'));
        else { const data = Buffer.alloc(entry.size); fs.readSync(fd, data, 0, entry.size, base + Number(entry.offset)); process.stdout.write(data.toString()); }
      } else console.log(file);
    }
  }
}
walk(root);
fs.closeSync(fd);
