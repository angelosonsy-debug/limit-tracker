/* Service Worker: كاش للعمل بدون إنترنت + فحص دوري للإشعارات */
importScripts('core.js', 'store.js');

var CACHE = 'claude-limits-__BUILD__';
var SHELL = ['./', 'index.html', 'app.js', 'core.js', 'store.js', 'style.css',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) { return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(function (hit) { return hit || fetch(e.request); })
  );
});

function checkLimits() {
  return Store.load().then(function (state) {
    var now = Date.now();
    var due = Core.dueNotifications(state.accounts, now);
    var jobs = due.map(function (a) {
      var t = Core.notificationText(a);
      Core.markNotified(a);
      return self.registration.showNotification(t.title, {
        body: t.body,
        tag: 'limit-' + a.id,
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-192.png',
        dir: 'rtl',
        lang: 'ar',
        vibrate: [200, 100, 200]
      });
    });
    var count = Core.badgeCount(state.accounts, now);
    try {
      if (self.navigator && self.navigator.setAppBadge) {
        jobs.push(count > 0 ? self.navigator.setAppBadge(count) : self.navigator.clearAppBadge());
      }
    } catch (err) { /* الشارة غير مدعومة */ }
    if (due.length) jobs.push(Store.save(state));
    return Promise.all(jobs);
  });
}

self.addEventListener('periodicsync', function (e) {
  if (e.tag === 'check-limits') e.waitUntil(checkLimits());
});

self.addEventListener('message', function (e) {
  if (e.data === 'check') e.waitUntil(checkLimits());
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if ('focus' in list[i]) return list[i].focus();
      }
      return self.clients.openWindow('./');
    })
  );
});
