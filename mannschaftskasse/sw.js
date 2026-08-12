/* Service Worker: hält die App aktuell und macht sie offline nutzbar.

   Strategie: zuerst das Netz, dann der Zwischenspeicher.
   Damit sieht man bei Empfang immer die neueste Fassung, und ohne Empfang
   die zuletzt geladene. Antwortet das Netz nicht innerhalb weniger Sekunden,
   wird sofort aus dem Zwischenspeicher bedient — auf dem Sportplatz mit
   einem Balken Empfang soll niemand auf einen weißen Bildschirm starren.

   Bei Änderungen an den Dateien CACHE hochzählen. */

var CACHE = 'mannschaftskasse-v11';
var NETZ_TIMEOUT = 3500;

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
    caches.open(CACHE)
      // no-cache: am Zwischenspeicher des Browsers vorbei, sonst landen
      // beim Aktualisieren wieder die alten Dateien im Cache.
      .then(function (cache) {
        return cache.addAll(ASSETS.map(function (u) {
          return new Request(u, { cache: 'no-cache' });
        }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) {
          return k === CACHE ? null : caches.delete(k);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

// Erlaubt der Seite, eine wartende Fassung sofort zu übernehmen.
self.addEventListener('message', function (event) {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

/* Wichtig: Der Zwischenspeicher des Browsers sitzt noch vor dem Netz.
   GitHub Pages erlaubt zehn Minuten Zwischenspeicherung — ohne 'no-cache'
   bekäme man beim Neustart schlicht wieder die alte Datei geliefert. */
function frischeAnfrage(request) {
  try {
    return new Request(request.url, { cache: 'no-cache' });
  } catch (e) {
    return request;
  }
}

function ausDemNetz(request) {
  var netzRequest = frischeAnfrage(request);
  return new Promise(function (resolve, reject) {
    var erledigt = false;
    var timer = setTimeout(function () {
      if (!erledigt) { erledigt = true; reject(new Error('Zeitüberschreitung')); }
    }, NETZ_TIMEOUT);

    fetch(netzRequest).then(function (res) {
      clearTimeout(timer);
      if (erledigt) {
        // Zu spät für die Anzeige, aber der Zwischenspeicher freut sich.
        if (res && res.ok) caches.open(CACHE).then(function (c) { c.put(request, res.clone()); });
        return;
      }
      erledigt = true;
      if (res && res.ok) caches.open(CACHE).then(function (c) { c.put(request, res.clone()); });
      resolve(res);
    }).catch(function (err) {
      clearTimeout(timer);
      if (!erledigt) { erledigt = true; reject(err); }
    });
  });
}

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    ausDemNetz(request).catch(function () {
      return caches.match(request).then(function (hit) {
        if (hit) return hit;
        // Unbekannte Adresse ohne Netz: die App selbst ausliefern.
        if (request.mode === 'navigate') return caches.match('index.html');
        return Response.error();
      });
    })
  );
});
