/* يبني مجلد dist من src ويختم نسخة الكاش داخل sw.js */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'src');
const dist = path.join(root, 'dist');

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, entry.name);
    const d = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

fs.rmSync(dist, { recursive: true, force: true });
copyDir(src, dist);

const stamp = (process.env.GITHUB_SHA || String(Date.now())).slice(0, 12);
const swPath = path.join(dist, 'sw.js');
fs.writeFileSync(swPath, fs.readFileSync(swPath, 'utf8').replace('__BUILD__', stamp));
fs.writeFileSync(path.join(dist, '.nojekyll'), '');
console.log('built dist/ with version', stamp);
