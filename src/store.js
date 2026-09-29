/* تخزين الحالة في IndexedDB — مشترك بين الصفحة والـ Service Worker */
(function (root) {
  var DB = 'claude-limits', STORE = 'kv', KEY = 'state';

  function open() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function load() {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var r = db.transaction(STORE).objectStore(STORE).get(KEY);
        r.onsuccess = function () { resolve(root.Core.normalizeState(r.result)); };
        r.onerror = function () { reject(r.error); };
      });
    });
  }

  function save(state) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(JSON.parse(JSON.stringify(state)), KEY);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  root.Store = { load: load, save: save };
})(typeof self !== 'undefined' ? self : this);
