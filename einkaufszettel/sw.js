/* Service worker: makes the app installable and opens it instantly.

   Network first, cache as fallback: with reception you always get the newest
   version, without it the last one loaded. Firestore keeps its own offline
   copy of the data, so only the app files are cached here.

   Bump CACHE whenever a file changes. */

var CACHE = 'einkaufszettel-v3';
var NET_TIMEOUT = 3500;

var ASSETS = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'core.js',
  'store.js',
  'config.js',
  'vendor/firebase.js',
  'vendor/anthropic.js',
  'icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'manifest.webmanifest'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) {
        return cache.addAll(ASSETS.map(function (u) { return new Request(u, { cache: 'no-cache' }); }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('message', function (event) {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  // Only this app's own files; Firestore, Google Fonts and Claude go straight to the network.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(new Promise(function (resolve) {
    var done = false;
    var fromCache = function () {
      return caches.match(req, { ignoreSearch: true }).then(function (hit) {
        return hit || (req.mode === 'navigate' ? caches.match('index.html') : null);
      });
    };
    var timer = setTimeout(function () {
      fromCache().then(function (hit) { if (hit && !done) { done = true; resolve(hit); } });
    }, NET_TIMEOUT);
    fetch(new Request(req, { cache: 'no-cache' })).then(function (res) {
      clearTimeout(timer);
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      if (!done) { done = true; resolve(res); }
    }, function () {
      clearTimeout(timer);
      fromCache().then(function (hit) {
        if (!done) { done = true; resolve(hit || Response.error()); }
      });
    });
  }));
});
