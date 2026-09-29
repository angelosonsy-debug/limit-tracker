const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../src/core.js');

const HOUR = 3600000;
const T0 = 1_700_000_000_000;

function acct(name = 'حساب 1') { return Core.createAccount(name); }

test('الإنتظار الافتراضي 5 ساعات', () => {
  assert.equal(Core.DEFAULT_WAIT_HOURS, 5);
  assert.equal(acct().waitHours, 5);
  assert.equal(Core.createAccount('x', 0).waitHours, 5);
  assert.equal(Core.createAccount('x', -3).waitHours, 5);
  assert.equal(Core.createAccount('x', 3).waitHours, 3);
});

test('اسم الحساب والمشروع مطلوبان', () => {
  assert.throws(() => Core.createAccount('   '));
  assert.throws(() => Core.addProject(acct(), ''));
  assert.equal(Core.createAccount('  حساب   أ  ').name, 'حساب أ');
});

test('وصلت الليمت: ينتهي بعد ساعات الانتظار', () => {
  const a = acct();
  Core.setLimitHit(a, T0);
  assert.equal(a.limitEndsAt, T0 + 5 * HOUR);
  Core.setLimitHit(a, T0, 2);
  assert.equal(a.limitEndsAt, T0 + 2 * HOUR);
});

test('الحالة: انتظار ثم جاهز', () => {
  const a = acct();
  assert.deepEqual(Core.getStatus(a, T0), { ready: true, remainingMs: 0 });
  Core.setLimitHit(a, T0);
  assert.equal(Core.getStatus(a, T0 + HOUR).ready, false);
  assert.equal(Core.getStatus(a, T0 + HOUR).remainingMs, 4 * HOUR);
  assert.equal(Core.getStatus(a, T0 + 5 * HOUR).ready, true);
});

test('تنسيق الوقت المتبقي', () => {
  assert.equal(Core.formatRemaining(0), '00:00:00');
  assert.equal(Core.formatRemaining(-5), '00:00:00');
  assert.equal(Core.formatRemaining(5 * HOUR), '05:00:00');
  assert.equal(Core.formatRemaining(3661000), '01:01:01');
});

test('التقدم بين 0 و 1', () => {
  const a = acct();
  assert.equal(Core.progress(a, T0), 1);
  Core.setLimitHit(a, T0);
  assert.equal(Core.progress(a, T0), 0);
  assert.equal(Core.progress(a, T0 + 2.5 * HOUR), 0.5);
  assert.equal(Core.progress(a, T0 + 9 * HOUR), 1);
});

test('الشارة تعد المشاريع النشطة في الحسابات الجاهزة فقط', () => {
  const a = acct('أ'); const b = acct('ب'); const c = acct('ج');
  Core.addProject(a, 'م1'); Core.addProject(a, 'م2');
  const done = Core.addProject(a, 'م3'); done.done = true;
  Core.addProject(b, 'م4');
  Core.setLimitHit(b, T0);
  // c بدون مشاريع
  assert.equal(Core.badgeCount([a, b, c], T0), 2);
  assert.equal(Core.badgeCount([a, b, c], T0 + 5 * HOUR), 3);
  assert.deepEqual(Core.readyAccounts([a, b, c], T0).map(x => x.name), ['أ']);
});

test('الإشعار يُرسل مرة واحدة فقط لكل انتهاء ليمت', () => {
  const a = acct(); Core.addProject(a, 'مشروع');
  Core.setLimitHit(a, T0);
  assert.equal(Core.dueNotifications([a], T0 + HOUR).length, 0);
  assert.equal(Core.dueNotifications([a], T0 + 5 * HOUR).length, 1);
  Core.markNotified(a);
  assert.equal(Core.dueNotifications([a], T0 + 6 * HOUR).length, 0);
  Core.setLimitHit(a, T0 + 6 * HOUR); // ليمت جديد
  assert.equal(Core.dueNotifications([a], T0 + 11 * HOUR).length, 1);
});

test('لا إشعار لحساب بلا مشاريع نشطة أو بلا ليمت مسجل', () => {
  const a = acct(); Core.setLimitHit(a, T0);
  assert.equal(Core.dueNotifications([a], T0 + 6 * HOUR).length, 0);
  const b = acct(); Core.addProject(b, 'م');
  assert.equal(Core.dueNotifications([b], T0).length, 0);
});

test('نص الإشعار يذكر الحساب والمشاريع النشطة', () => {
  const a = acct('الحساب الثاني');
  Core.addProject(a, 'موقع');
  const d = Core.addProject(a, 'قديم'); d.done = true;
  Core.addProject(a, 'تطبيق');
  const t = Core.notificationText(a);
  assert.match(t.title, /الحساب الثاني/);
  assert.match(t.body, /موقع/);
  assert.match(t.body, /تطبيق/);
  assert.doesNotMatch(t.body, /قديم/);
});

test('تعديل وقت الانتهاء يدويا ومسحه', () => {
  const a = acct(); a.notifiedFor = 123;
  Core.setLimitEnd(a, T0 + HOUR);
  assert.equal(a.limitEndsAt, T0 + HOUR);
  assert.equal(a.notifiedFor, null);
  Core.clearLimit(a);
  assert.equal(a.limitEndsAt, null);
});

test('normalizeState يتعامل مع بيانات فاسدة', () => {
  assert.deepEqual(Core.normalizeState(null), { accounts: [] });
  assert.deepEqual(Core.normalizeState({ accounts: 5 }), { accounts: [] });
  const s = Core.normalizeState({ accounts: [{ name: 'أ', waitHours: 'x', limitEndsAt: 'y', projects: [{ name: 'م' }, null, { name: ' ' }] }, null, { name: '' }] });
  assert.equal(s.accounts.length, 1);
  assert.equal(s.accounts[0].waitHours, 5);
  assert.equal(s.accounts[0].limitEndsAt, null);
  assert.equal(s.accounts[0].projects.length, 1);
});
