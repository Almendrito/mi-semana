/*
 * Service worker minimo: permite abrir la app sin conexion.
 * Estrategia network-first: si hay red se sirve lo fresco (asi los cambios
 * llegan al tiro, sin quedarse pegado en una version vieja) y se guarda copia;
 * si no hay red, se responde desde el cache.
 */
var CACHE = 'mi-semana-v3';
var SHELL = [
  './',
  './index.html',
  './css/styles.css',
  './js/config.js',
  './js/logic.js',
  './js/storage.js',
  './js/app.js',
  './manifest.json',
  './icon.svg'
];

self.addEventListener('install', function (ev) {
  ev.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }));
  self.skipWaiting();
});

self.addEventListener('activate', function (ev) {
  ev.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) {
      return k === CACHE ? null : caches.delete(k);
    }));
  }));
  self.clients.claim();
});

self.addEventListener('fetch', function (ev) {
  if (ev.request.method !== 'GET') return;
  if (new URL(ev.request.url).origin !== self.location.origin) return;

  ev.respondWith(
    fetch(ev.request).then(function (res) {
      if (res.ok) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(ev.request, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(ev.request).then(function (hit) {
        return hit || caches.match('./index.html');
      });
    })
  );
});
