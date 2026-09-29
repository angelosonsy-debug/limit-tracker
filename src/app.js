(function () {
  var state = { accounts: [] };
  var lastBadge = -1;
  var lastSummary = '';
  var readyMap = {};

  // كشف بيئة Capacitor
  var isNative = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();
  var Notifs = null;
  var Prefs = null;
  if (isNative) {
    Notifs = Capacitor.Plugins.LocalNotifications;
    Prefs  = Capacitor.Plugins.Preferences;
  }

  // ===== التخزين =====
  function saveState() {
    var json = JSON.stringify(state);
    if (isNative && Prefs) {
      return Prefs.set({ key: 'state', value: json });
    }
    return Store.save(state);
  }

  function loadState() {
    if (isNative && Prefs) {
      return Prefs.get({ key: 'state' }).then(function (r) {
        try { return Core.normalizeState(JSON.parse(r.value || '{}')); }
        catch (e) { return Core.normalizeState(null); }
      });
    }
    return Store.load();
  }

  // ===== الإشعارات المجدولة (Capacitor) =====
  var pendingNotifIds = {};

  function scheduleNativeNotif(account) {
    if (!isNative || !Notifs || !account.limitEndsAt) return;
    var active = Core.activeProjects(account);
    if (!active.length) return;
    var id = Math.abs(account.id.split('').reduce(function(h,c){return (h*31+c.charCodeAt(0))|0},0)) % 99000 + 1000;
    // ألغي القديم أولا
    Notifs.cancel({ notifications: [{ id: id }] }).catch(function(){});
    var t = Core.notificationText(account);
    Notifs.schedule({
      notifications: [{
        id: id,
        title: t.title,
        body: t.body,
        schedule: { at: new Date(account.limitEndsAt), allowWhileIdle: true },
        channelId: 'limits',
        smallIcon: 'ic_notification',
        iconColor: '#12343b',
        extra: { accountId: account.id }
      }]
    }).catch(function(e){ console.warn('schedule notif:', e); });
    pendingNotifIds[account.id] = id;
  }

  function cancelNativeNotif(account) {
    if (!isNative || !Notifs) return;
    var id = pendingNotifIds[account.id];
    if (id) Notifs.cancel({ notifications: [{ id: id }] }).catch(function(){});
  }

  function setupNotifChannel() {
    if (!isNative || !Notifs) return;
    Notifs.createChannel({
      id: 'limits',
      name: 'ليمت Claude',
      description: 'إشعارات انتهاء وقت الانتظار',
      importance: 5,
      vibration: true,
      sound: 'default',
      lights: true
    }).catch(function(){});
  }

  function requestNotifPermission() {
    if (!isNative || !Notifs) {
      if ('Notification' in window) return Notification.requestPermission();
      return Promise.resolve('denied');
    }
    return Notifs.requestPermissions().then(function(r){ return r.display; });
  }

  // بعد تعديل الليمت: أعد جدولة الإشعار
  function resyncNotif(account) {
    if (account.limitEndsAt && account.limitEndsAt > Date.now()) {
      scheduleNativeNotif(account);
    } else {
      cancelNativeNotif(account);
    }
  }

  // ===== شارة التطبيق =====
  function updateBadge() {
    var n = Core.badgeCount(state.accounts, Date.now());
    if (n === lastBadge) return;
    lastBadge = n;
    document.title = (n > 0 ? '(' + n + ') ' : '') + 'ليمت Claude';
    if (!isNative) {
      try { if (navigator.setAppBadge) { n > 0 ? navigator.setAppBadge(n) : navigator.clearAppBadge(); } } catch(e){}
    }
    // أندرويد: الشارة من خلال قناة الإشعارات - لا API مباشر لكن يُحقق ذلك بإشعار مستمر اختياري
  }

  // ===== DOM helpers =====
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

  function persist() { return saveState(); }
  function change(fn) { fn(); persist(); render(); }

  function toLocalInput(ts) {
    if (ts == null) return '';
    var d = new Date(ts - new Date(ts).getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 16);
  }

  function fmtEnd(ts) {
    return new Date(ts).toLocaleString('ar-EG', { weekday: 'short', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });
  }

  // ===== بناء كارد الحساب =====
  function accountCard(a) {
    var now = Date.now();
    var st = Core.getStatus(a, now);
    var active = Core.activeProjects(a);

    var ringText = h('span', { 'data-ring-text': a.id }, st.ready ? 'جاهز' : Core.formatRemaining(st.remainingMs));
    var ring = h('div', { class: 'ring', 'data-ring': a.id }, ringText);
    ring.style.setProperty('--p', Math.round(Core.progress(a, now) * 100));

    var badge = h('span', { class: 'badge ' + (st.ready ? 'ready' : 'waiting'), 'data-badge': a.id },
      st.ready ? '✓ متاح للعمل' : 'ينتهي ' + fmtEnd(a.limitEndsAt));

    var endInput = h('input', {
      type: 'datetime-local', id: 'end-' + a.id, value: toLocalInput(a.limitEndsAt),
      onchange: function (e) {
        var t = e.target.value ? new Date(e.target.value).getTime() : null;
        change(function () { Core.setLimitEnd(a, t); resyncNotif(a); });
      }
    });
    var waitInput = h('input', {
      type: 'number', id: 'wait-' + a.id, min: '0.5', max: '48', step: '0.5',
      inputmode: 'decimal', value: String(a.waitHours),
      onchange: function (e) {
        var v = Number(e.target.value);
        change(function () { a.waitHours = v > 0 ? v : Core.DEFAULT_WAIT_HOURS; });
      }
    });

    var list = h('ul', { class: 'projects' });
    if (!a.projects.length) {
      list.append(h('li', {}, h('span', { class: 'pname muted' }, 'لا توجد مشاريع بعد')));
    }
    a.projects.forEach(function (p) {
      list.append(h('li', { class: p.done ? 'done' : '' },
        h('input', { type: 'checkbox', checked: p.done, 'aria-label': 'تم: ' + p.name,
          onchange: function (e) { change(function () { p.done = e.target.checked; }); } }),
        h('span', { class: 'pname' }, p.name),
        h('button', { class: 'btn small danger', type: 'button', 'aria-label': 'حذف ' + p.name,
          onclick: function () { change(function () { a.projects = a.projects.filter(function (x) { return x.id !== p.id; }); }); } }, '✕')
      ));
    });

    var projInput = h('input', { type: 'text', placeholder: 'اسم مشروع جديد', maxlength: '60' });
    var projForm = h('form', { class: 'row', autocomplete: 'off',
      onsubmit: function (e) {
        e.preventDefault();
        if (!projInput.value.trim()) return;
        change(function () { Core.addProject(a, projInput.value); });
        projInput.value = '';
      }
    }, projInput, h('button', { class: 'btn', type: 'submit' }, 'إضافة'));

    return h('section', { class: 'card ' + (st.ready ? 'ready' : 'waiting'), 'data-account': a.id },
      h('div', { class: 'card-head' }, ring,
        h('div', { class: 'card-title' }, h('h2', {}, a.name), badge)),
      h('div', { class: 'limit' },
        h('div', { class: 'actions' },
          h('button', { class: 'btn warn', type: 'button',
            onclick: function () { change(function () { Core.setLimitHit(a, Date.now()); resyncNotif(a); }); } }, '⏳ وصلت الليمت الآن'),
          h('button', { class: 'btn ready-btn', type: 'button',
            onclick: function () { change(function () { Core.clearLimit(a); cancelNativeNotif(a); }); } }, '✓ الحساب جاهز')),
        h('div', { class: 'two' },
          h('label', { class: 'field', for: 'wait-' + a.id }, 'ساعات الانتظار', waitInput),
          h('label', { class: 'field', for: 'end-' + a.id }, 'وقت انتهاء الليمت', endInput))),
      h('p', { class: 'section-title' }, 'المشاريع · ' + active.length + ' نشط'),
      list, projForm,
      h('div', { class: 'delete-wrap' },
        h('button', { class: 'btn small danger block', type: 'button', onclick: function () {
          if (confirm('حذف حساب «' + a.name + '» بكل مشاريعه؟')) {
            change(function () { cancelNativeNotif(a); state.accounts = state.accounts.filter(function (x) { return x.id !== a.id; }); });
          }
        } }, 'حذف الحساب'))
    );
  }

  function render() {
    var box = document.getElementById('accounts');
    box.replaceChildren();
    if (!state.accounts.length) {
      box.append(h('div', { class: 'empty' },
        h('p', {}, '📋'),
        h('p', {}, 'أضف حساباتك على Claude لتبدأ التتبع')));
    }
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
    var text = state.accounts.length ? ready + ' جاهز · ' + waiting + ' في الانتظار' : 'لا توجد حسابات';
    if (force || text !== lastSummary) { document.getElementById('summary').textContent = text; lastSummary = text; }
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
    if (flipped) render();
    updateSummary(false);
    updateBadge();
  }

  // إشعار ويب (للمتصفح فقط)
  function notifyDueWeb() {
    if (isNative) return;
    var due = Core.dueNotifications(state.accounts, Date.now());
    if (!due.length) return;
    due.forEach(function (a) {
      var t = Core.notificationText(a);
      Core.markNotified(a);
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(t.title, { body: t.body, icon: 'icons/icon-192.png', dir: 'rtl', lang: 'ar' });
      }
    });
    persist();
  }

  // ===== شريط الإشعارات =====
  function renderNoticeBar() {
    var bar = document.getElementById('notice');
    bar.replaceChildren();
    if (isNative) { bar.hidden = true; return; } // على أندرويد لا نحتاج الشريط
    if (!('Notification' in window)) {
      bar.hidden = false;
      bar.append(h('span', {}, 'المتصفح لا يدعم الإشعارات'));
      return;
    }
    if (Notification.permission === 'granted') { bar.hidden = true; return; }
    if (Notification.permission === 'denied') {
      bar.hidden = false;
      bar.append(h('span', {}, 'الإشعارات محظورة — فعّلها من إعدادات الموقع'));
      return;
    }
    bar.hidden = false;
    bar.append(
      h('span', {}, '🔔 فعّل الإشعارات لتصلك تنبيه عند جاهزية كل حساب'),
      h('button', { class: 'btn small', onclick: function () {
        requestNotifPermission().then(function () { renderNoticeBar(); });
      }}, 'تفعيل')
    );
  }

  // ===== تهيئة التطبيق =====
  function init() {
    setupNotifChannel();

    // طلب الإذن تلقائيا على أندرويد
    if (isNative) {
      requestNotifPermission().catch(function(){});
    }

    document.getElementById('add-account').addEventListener('submit', function (e) {
      e.preventDefault();
      var input = document.getElementById('new-account');
      if (!input.value.trim()) return;
      change(function () { state.accounts.push(Core.createAccount(input.value)); });
      input.value = '';
    });

    // الاستماع لضغط إشعار أندرويد
    if (isNative && Notifs) {
      Notifs.addListener('localNotificationActionPerformed', function () {
        // وصلنا من الإشعار، حدّث الواجهة
        loadState().then(function(s){ state = s; render(); });
      });
    }

    loadState().then(function (s) {
      state = s;
      // أعد جدولة الإشعارات لكل حساب في الانتظار
      state.accounts.forEach(function (a) {
        if (a.limitEndsAt && a.limitEndsAt > Date.now()) scheduleNativeNotif(a);
      });
      render();
      renderNoticeBar();
      setInterval(tick, 1000);
      setInterval(notifyDueWeb, 5000);
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) { loadState().then(function(s){ state = s; render(); }); }
      });
    });

    // Service Worker (ويب فقط)
    if (!isNative && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(function(){});
    }
  }

  // انتظار Capacitor إذا كنا في بيئة أصلية
  if (isNative && typeof CapacitorDocumentReady !== 'undefined') {
    document.addEventListener('deviceready', init);
  } else {
    document.addEventListener('DOMContentLoaded', function(){ /* already loaded */ });
    if (document.readyState !== 'loading') init();
    else document.addEventListener('DOMContentLoaded', init);
  }

})();
