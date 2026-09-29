const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');

test.before(() => {
  execFileSync(process.execPath, [path.join(root, 'scripts', 'build.js')], { env: { ...process.env, GITHUB_SHA: 'abc123def456789' } });
});

const read = (f) => fs.readFileSync(path.join(dist, f), 'utf8');

test('ملفات dist الأساسية موجودة', () => {
  for (const f of ['index.html', 'app.js', 'core.js', 'store.js', 'sw.js', 'style.css', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', '.nojekyll']) {
    assert.ok(fs.existsSync(path.join(dist, f)), 'مفقود: ' + f);
  }
});

test('manifest صالح للتثبيت كتطبيق', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.equal(m.display, 'standalone');
  assert.equal(m.dir, 'rtl');
  assert.ok(m.name && m.short_name);
  assert.equal(m.start_url, './');
  const sizes = m.icons.map(i => i.sizes);
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'));
  for (const i of m.icons) assert.ok(fs.existsSync(path.join(dist, i.src)), 'أيقونة مفقودة: ' + i.src);
});

test('الأيقونات PNG حقيقية بالأبعاد الصحيحة', () => {
  for (const [f, s] of [['icons/icon-192.png', 192], ['icons/icon-512.png', 512]]) {
    const b = fs.readFileSync(path.join(dist, f));
    assert.equal(b.subarray(1, 4).toString(), 'PNG');
    assert.equal(b.readUInt32BE(16), s);
    assert.equal(b.readUInt32BE(20), s);
  }
});

test('index.html يربط كل الملفات ولا يعتمد على مصادر خارجية', () => {
  const html = read('index.html');
  for (const ref of ['manifest.webmanifest', 'style.css', 'core.js', 'store.js', 'app.js']) {
    assert.ok(html.includes(ref), 'غير مربوط: ' + ref);
  }
  assert.ok(/dir="rtl"/.test(html));
  assert.ok(!/https?:\/\//.test(html), 'يجب ألا يحتوي روابط خارجية');
  assert.ok(html.indexOf('core.js') < html.indexOf('store.js') && html.indexOf('store.js') < html.indexOf('app.js'));
});

test('Service Worker: تم ختم النسخة وكل ملفات الكاش موجودة', () => {
  const sw = read('sw.js');
  assert.ok(!sw.includes('__BUILD__'));
  assert.ok(sw.includes('claude-limits-abc123def456'));
  const shell = /var SHELL = (\[[\s\S]*?\]);/.exec(sw);
  assert.ok(shell, 'قائمة SHELL غير موجودة');
  const files = eval(shell[1]);
  for (const f of files) {
    if (f === './') continue;
    assert.ok(fs.existsSync(path.join(dist, f)), 'ملف كاش مفقود: ' + f);
  }
});

test('كل ملفات JS سليمة نحويا', () => {
  for (const f of ['app.js', 'core.js', 'store.js', 'sw.js']) {
    assert.doesNotThrow(() => new Function(read(f)), f);
  }
});

test('الإشعارات والشارة موجودة في الكود', () => {
  assert.ok(read('app.js').includes('setAppBadge'));
  assert.ok(read('sw.js').includes('setAppBadge'));
  assert.ok(read('sw.js').includes('periodicsync'));
  assert.ok(read('app.js').includes('requestPermission'));
});
