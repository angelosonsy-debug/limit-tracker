/* منطق التطبيق الخالص (بدون DOM) — يعمل في المتصفح وفي الـ Service Worker وفي Node للاختبارات */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Core = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var HOUR = 3600000;
  var DEFAULT_WAIT_HOURS = 5;
  var seq = 0;

  function uid() {
    seq += 1;
    return Date.now().toString(36) + '-' + seq + '-' + Math.random().toString(36).slice(2, 7);
  }

  function cleanName(name) {
    return String(name == null ? '' : name).trim().replace(/\s+/g, ' ');
  }

  function createAccount(name, waitHours) {
    var n = cleanName(name);
    if (!n) throw new Error('اسم الحساب مطلوب');
    var w = Number(waitHours);
    return {
      id: uid(),
      name: n,
      waitHours: w > 0 && isFinite(w) ? w : DEFAULT_WAIT_HOURS,
      limitEndsAt: null,
      notifiedFor: null,
      projects: []
    };
  }

  function addProject(account, name) {
    var n = cleanName(name);
    if (!n) throw new Error('اسم المشروع مطلوب');
    var p = { id: uid(), name: n, done: false };
    account.projects.push(p);
    return p;
  }

  function setLimitHit(account, now, hours) {
    var h = hours == null ? account.waitHours : Number(hours);
    if (!(h > 0) || !isFinite(h)) h = DEFAULT_WAIT_HOURS;
    account.limitEndsAt = now + h * HOUR;
    account.notifiedFor = null;
    return account;
  }

  function setLimitEnd(account, endsAt) {
    account.limitEndsAt = endsAt == null ? null : Number(endsAt);
    account.notifiedFor = null;
    return account;
  }

  function clearLimit(account) {
    account.limitEndsAt = null;
    account.notifiedFor = null;
    return account;
  }

  function getStatus(account, now) {
    var end = account.limitEndsAt;
    if (end == null || end <= now) return { ready: true, remainingMs: 0 };
    return { ready: false, remainingMs: end - now };
  }

  function progress(account, now) {
    var end = account.limitEndsAt;
    if (end == null) return 1;
    var total = account.waitHours * HOUR;
    var left = Math.max(0, end - now);
    return Math.min(1, Math.max(0, 1 - left / total));
  }

  function activeProjects(account) {
    return account.projects.filter(function (p) { return !p.done; });
  }

  function readyAccounts(accounts, now) {
    return accounts.filter(function (a) {
      return getStatus(a, now).ready && activeProjects(a).length > 0;
    });
  }

  function badgeCount(accounts, now) {
    return readyAccounts(accounts, now).reduce(function (sum, a) {
      return sum + activeProjects(a).length;
    }, 0);
  }

  function formatRemaining(ms) {
    if (ms <= 0) return '00:00:00';
    var s = Math.ceil(ms / 1000);
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    var p = function (x) { return (x < 10 ? '0' : '') + x; };
    return p(h) + ':' + p(m) + ':' + p(sec);
  }

  /* الحسابات التي انتهى ليمتها ولم يُرسل لها إشعار بعد */
  function dueNotifications(accounts, now) {
    return accounts.filter(function (a) {
      return a.limitEndsAt != null &&
        a.limitEndsAt <= now &&
        a.notifiedFor !== a.limitEndsAt &&
        activeProjects(a).length > 0;
    });
  }

  function markNotified(account) {
    account.notifiedFor = account.limitEndsAt;
    return account;
  }

  function notificationText(account) {
    var names = activeProjects(account).map(function (p) { return p.name; });
    return {
      title: 'حساب «' + account.name + '» جاهز للعمل',
      body: 'المشاريع: ' + names.join('، ')
    };
  }

  function normalizeState(raw) {
    var out = { accounts: [] };
    if (!raw || !Array.isArray(raw.accounts)) return out;
    raw.accounts.forEach(function (a) {
      if (!a || !cleanName(a.name)) return;
      out.accounts.push({
        id: a.id || uid(),
        name: cleanName(a.name),
        waitHours: a.waitHours > 0 ? Number(a.waitHours) : DEFAULT_WAIT_HOURS,
        limitEndsAt: typeof a.limitEndsAt === 'number' ? a.limitEndsAt : null,
        notifiedFor: typeof a.notifiedFor === 'number' ? a.notifiedFor : null,
        projects: (Array.isArray(a.projects) ? a.projects : [])
          .filter(function (p) { return p && cleanName(p.name); })
          .map(function (p) { return { id: p.id || uid(), name: cleanName(p.name), done: !!p.done }; })
      });
    });
    return out;
  }

  return {
    HOUR: HOUR,
    DEFAULT_WAIT_HOURS: DEFAULT_WAIT_HOURS,
    createAccount: createAccount,
    addProject: addProject,
    setLimitHit: setLimitHit,
    setLimitEnd: setLimitEnd,
    clearLimit: clearLimit,
    getStatus: getStatus,
    progress: progress,
    activeProjects: activeProjects,
    readyAccounts: readyAccounts,
    badgeCount: badgeCount,
    formatRemaining: formatRemaining,
    dueNotifications: dueNotifications,
    markNotified: markNotified,
    notificationText: notificationText,
    normalizeState: normalizeState
  };
});
