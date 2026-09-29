const test   = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('node:fs');
const path   = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');

test.before(() => {
  execFileSync(process.execPath,
    [path.join(root, 'scripts', 'build.js')],
    { env: { ...process.env, GITHUB_SHA: 'abc123def456789' } });
});

const read = (f) => fs.readFileSync(path.join(dist, f), 'utf8');

test('ملفات dist الأساسية موجودة', () => {
  for (const f of ['index.html', 'app.js', 'core.js', 'store.js', 'style.css',
                   'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png']) {
    assert.ok(fs.existsSync(path.join(dist, f)), 'مفقود: ' + f);
  }
});

test('manifest صالح لتطبيق أندرويد', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.equal(m.display, 'standalone');
  assert.equal(m.dir, 'rtl');
  assert.ok(m.name && m.short_name);
  assert.equal(m.start_url, './');
  const sizes = m.icons.map(i => i.sizes);
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'));
  for (const i of m.icons)
    assert.ok(fs.existsSync(path.join(dist, i.src)), 'أيقونة مفقودة: ' + i.src);
});

test('الأيقونات PNG حقيقية بالأبعاد الصحيحة', () => {
  for (const [f, s] of [['icons/icon-192.png', 192], ['icons/icon-512.png', 512]]) {
    const b = fs.readFileSync(path.join(dist, f));
    assert.equal(b.subarray(1, 4).toString(), 'PNG');
    assert.equal(b.readUInt32BE(16), s);
    assert.equal(b.readUInt32BE(20), s);
  }
});

test('index.html يربط كل الملفات بالترتيب الصحيح', () => {
  const html = read('index.html');
  for (const ref of ['manifest.webmanifest', 'style.css', 'core.js', 'store.js', 'app.js'])
    assert.ok(html.includes(ref), 'غير مربوط: ' + ref);
  assert.ok(/dir="rtl"/.test(html));
  const iCore = html.indexOf('core.js');
  const iStore = html.indexOf('store.js');
  const iApp   = html.indexOf('app.js');
  assert.ok(iCore < iStore && iStore < iApp, 'ترتيب السكريبتات خاطئ');
});

test('capacitor stub موجود في index.html', () => {
  const html = read('index.html');
  assert.ok(html.includes('isNativePlatform'), 'Capacitor stub مفقود');
});

test('app.js يستخدم Capacitor.Plugins', () => {
  const js = read('app.js');
  assert.ok(js.includes('Capacitor.isNativePlatform'), 'فحص isNativePlatform مفقود');
  assert.ok(js.includes('LocalNotifications'), 'LocalNotifications مفقود');
  assert.ok(js.includes('Preferences'), 'Preferences مفقود');
  assert.ok(js.includes('scheduleNativeNotif'), 'جدولة الإشعارات مفقودة');
  assert.ok(js.includes('requestNotifPermission'), 'طلب الإذن مفقود');
});

test('كل ملفات JS سليمة نحوياً', () => {
  for (const f of ['app.js', 'core.js', 'store.js']) {
    assert.doesNotThrow(() => new Function(read(f)), 'خطأ نحوي في ' + f);
  }
});

test('capacitor.config.json موجود وصالح', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(root, 'capacitor.config.json'), 'utf8'));
  assert.ok(cfg.appId.includes('.'), 'appId يجب أن يكون reverse-domain');
  assert.equal(cfg.webDir, 'dist');
  assert.ok(cfg.appName);
});
