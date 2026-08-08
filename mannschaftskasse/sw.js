/* Service Worker: macht die App offline nutzbar.
   Bei Änderungen an den Dateien CACHE hochzählen. */

var CACHE = 'mannschaftskasse-v2';
var ASSETS = [
  '.',
  'index.html',
  'styles.css',
  'app.js',
  'icon.svg',
  'manifest.webmanifest'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) { return cache.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(function (hit) {
      if (hit) {
        // Im Hintergrund aktualisieren, damit neue Versionen ankommen.
        fetch(event.request).then(function (res) {
          if (res && res.ok) caches.open(CACHE).then(function (c) { c.put(event.request, res.clone()); });
        }).catch(function () {});
        return hit;
      }
      return fetch(event.request).catch(function () { return caches.match('index.html'); });
    })
  );
});
