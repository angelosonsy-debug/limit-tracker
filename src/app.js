(function () {
  var state = { accounts: [] };
  var lastBadge = -1;
  var lastSummary = '';
  var readyMap = {};

  function h(tag, props) {
    var el = document.createElement(tag);
    props = props || {};
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (k.indexOf('on') === 0) el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'value' || k === 'checked' || k === 'hidden') el[k] = v;
      else el.setAttribute(k, v);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  function persist() { return Store.save(state); }
  function change(fn) { fn(); persist(); render(); }

  function toLocalInput(ts) {
    if (ts == null) return '';
    var d = new Date(ts - new Date(ts).getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 16);
  }

  function fmtEnd(ts) {
    return new Date(ts).toLocaleString('ar-EG', { weekday: 'short', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });
  }

  function accountCard(a) {
    var now = Date.now();
    var st = Core.getStatus(a, now);
    var active = Core.activeProjects(a);

    var ringText = h('span', { 'data-ring-text': a.id }, st.ready ? 'جاهز' : Core.formatRemaining(st.remainingMs));
    var ring = h('div', { class: 'ring', 'data-ring': a.id }, ringText);
    ring.style.setProperty('--p', Math.round(Core.progress(a, now) * 100));

    var badge = h('span', { class: 'badge ' + (st.ready ? 'ready' : 'waiting'), 'data-badge': a.id },
      st.ready ? 'متاح للعمل' : 'ينتهي ' + fmtEnd(a.limitEndsAt));

    var endInput = h('input', {
      type: 'datetime-local', id: 'end-' + a.id, value: toLocalInput(a.limitEndsAt),
      onchange: function (e) {
        var t = e.target.value ? new Date(e.target.value).getTime() : null;
        change(function () { Core.setLimitEnd(a, t); });
      }
    });
    var waitInput = h('input', {
      type: 'number', id: 'wait-' + a.id, min: '0.5', max: '48', step: '0.5', inputmode: 'decimal', value: String(a.waitHours),
      onchange: function (e) {
        var v = Number(e.target.value);
        change(function () { a.waitHours = v > 0 ? v : Core.DEFAULT_WAIT_HOURS; });
      }
    });

    var list = h('ul', { class: 'projects' });
    if (!a.projects.length) list.append(h('li', {}, h('span', { class: 'pname' }, 'لا توجد مشاريع بعد')));
    a.projects.forEach(function (p) {
      list.append(h('li', { class: p.done ? 'done' : '' },
        h('input', { type: 'checkbox', checked: p.done, 'aria-label': 'تم: ' + p.name, onchange: function (e) { change(function () { p.done = e.target.checked; }); } }),
        h('span', { class: 'pname' }, p.name),
        h('button', { class: 'btn small danger', type: 'button', 'aria-label': 'حذف ' + p.name, onclick: function () { change(function () { a.projects = a.projects.filter(function (x) { return x.id !== p.id; }); }); } }, 'حذف')
      ));
    });

    var projInput = h('input', { type: 'text', placeholder: 'اسم مشروع جديد', maxlength: '60', 'aria-label': 'اسم مشروع جديد' });
    var projForm = h('form', { class: 'row', autocomplete: 'off',
      onsubmit: function (e) {
        e.preventDefault();
        if (!projInput.value.trim()) return;
        change(function () { Core.addProject(a, projInput.value); });
      } }, projInput, h('button', { class: 'btn', type: 'submit' }, 'إضافة مشروع'));

    return h('section', { class: 'card ' + (st.ready ? 'ready' : 'waiting'), 'data-account': a.id },
      h('div', { class: 'card-head' }, ring,
        h('div', { class: 'card-title' }, h('h2', {}, a.name), badge)),
      h('div', { class: 'limit' },
        h('div', { class: 'actions' },
          h('button', { class: 'btn warn', type: 'button', onclick: function () { change(function () { Core.setLimitHit(a, Date.now()); }); } }, 'وصلت الليمت الآن'),
          h('button', { class: 'btn', type: 'button', onclick: function () { change(function () { Core.clearLimit(a); }); } }, 'الحساب جاهز')),
        h('div', { class: 'two' },
          h('label', { class: 'field', for: 'wait-' + a.id }, 'ساعات الانتظار', waitInput),
          h('label', { class: 'field', for: 'end-' + a.id }, 'وقت انتهاء الليمت', endInput))),
      h('p', { class: 'section-title' }, 'المشاريع (' + active.length + ' نشطة)'),
      list, projForm,
      h('div', { class: 'actions', style: 'margin-top:12px' },
        h('button', { class: 'btn small danger', type: 'button', onclick: function () {
          if (confirm('حذف الحساب «' + a.name + '» بكل مشاريعه؟')) change(function () { state.accounts = state.accounts.filter(function (x) { return x.id !== a.id; }); });
        } }, 'حذف الحساب'))
    );
  }

  function render() {
    var box = document.getElementById('accounts');
    box.replaceChildren();
    if (!state.accounts.length) box.append(h('p', { class: 'empty' }, 'أضف أول حساب Claude لتبدأ التتبع.'));
    state.accounts.forEach(function (a) { box.append(accountCard(a)); });
    readyMap = {};
    state.accounts.forEach(function (a) { readyMap[a.id] = Core.getStatus(a, Date.now()).ready; });
    updateSummary(true);
    updateBadge();
  }

  function updateSummary(force) {
    var now = Date.now();
    var ready = Core.readyAccounts(state.accounts, now).length;
    var waiting = state.accounts.filter(function (a) { return !Core.getStatus(a, now).ready; }).length;
    var text = state.accounts.length ? ready + ' حساب جاهز للعمل · ' + waiting + ' في الانتظار' : '';
    if (force || text !== lastSummary) { document.getElementById('summary').textContent = text; lastSummary = text; }
  }

  function updateBadge() {
    var n = Core.badgeCount(state.accounts, Date.now());
    if (n === lastBadge) return;
    lastBadge = n;
    document.title = (n > 0 ? '(' + n + ') ' : '') + 'متتبع ليمت Claude';
    try {
      if (navigator.setAppBadge) { if (n > 0) navigator.setAppBadge(n); else navigator.clearAppBadge(); }
    } catch (e) { /* غير مدعوم */ }
  }

  function tick() {
    var now = Date.now();
    var flipped = false;
    state.accounts.forEach(function (a) {
      var st = Core.getStatus(a, now);
      if (st.ready !== readyMap[a.id]) flipped = true;
      var t = document.querySelector('[data-ring-text="' + a.id + '"]');
      if (t) t.textContent = st.ready ? 'جاهز' : Core.formatRemaining(st.remainingMs);
      var r = document.querySelector('[data-ring="' + a.id + '"]');
      if (r) r.style.setProperty('--p', Math.round(Core.progress(a, now) * 100));
    });
    if (flipped) { render(); }
    notifyDue();
    updateSummary(false);
    updateBadge();
  }

  function notifyDue() {
    var due = Core.dueNotifications(state.accounts, Date.now());
    if (!due.length) return;
    due.forEach(function (a) {
      var t = Core.notificationText(a);
      Core.markNotified(a);
      if ('Notification' in window && Notification.permission === 'granted' && navigator.serviceWorker) {
        navigator.serviceWorker.ready.then(function (reg) {
          reg.showNotification(t.title, { body: t.body, tag: 'limit-' + a.id, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', dir: 'rtl', lang: 'ar', vibrate: [200, 100, 200] });
        });
      }
    });
    persist();
  }

  function renderNotice() {
    var n = document.getElementById('notice');
    n.replaceChildren();
    if (!('Notification' in window)) {
      n.hidden = false; n.append(h('span', {}, 'هذا المتصفح لا يدعم الإشعارات.')); return;
    }
    if (Notification.permission === 'granted') { n.hidden = true; return; }
    if (Notification.permission === 'denied') {
      n.hidden = false; n.append(h('span', {}, 'الإشعارات محظورة. فعّلها من إعدادات الموقع في المتصفح.')); return;
    }
    n.hidden = false;
    n.append(h('span', {}, 'فعّل الإشعارات لتصلك رسالة عند جاهزية كل حساب.'),
      h('button', { class: 'btn small', type: 'button', onclick: enableNotifications }, 'تفعيل'));
  }

  function enableNotifications() {
    Notification.requestPermission().then(function () { renderNotice(); registerBackground(); });
  }

  function registerBackground() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready.then(function (reg) {
      if (reg.periodicSync && Notification.permission === 'granted') {
        reg.periodicSync.register('check-limits', { minInterval: 15 * 60 * 1000 }).catch(function () {});
      }
    });
  }

  function init() {
    document.getElementById('add-account').addEventListener('submit', function (e) {
      e.preventDefault();
      var input = document.getElementById('new-account');
      if (!input.value.trim()) return;
      change(function () { state.accounts.push(Core.createAccount(input.value)); });
      input.value = '';
    });

    Store.load().then(function (s) {
      state = s;
      render();
      renderNotice();
      setInterval(tick, 1000);
      document.addEventListener('visibilitychange', function () { if (!document.hidden) { render(); tick(); } });
    });

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').then(registerBackground).catch(function () {});
    }
  }

  init();
})();
