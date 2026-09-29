const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src  = path.join(root, 'src');
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

// .nojekyll لـ GitHub Pages (اختياري)
fs.writeFileSync(path.join(dist, '.nojekyll'), '');

const stamp = (process.env.GITHUB_SHA || String(Date.now())).slice(0, 12);
console.log('✓ بُني dist/ بنجاح | النسخة:', stamp);
