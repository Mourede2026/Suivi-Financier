/* Service worker — met en cache la coquille de l'application (app shell) pour
   permettre l'installation en "application mobile" (PWA) et un chargement rapide.
   Les données elles-mêmes (Google Sheet) nécessitent toujours une connexion réseau. */
const CACHE_NAME = 'zs-shell-v2';
const SHELL_FILES = [
  './',
  './index.html',
  './css/style.css',
  './js/api.js',
  './js/app.js',
  './js/centres-seed.js',
  './js/config.js',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Ne jamais mettre en cache les appels à l'API Google Apps Script (données live)
  if (req.method !== 'GET' || req.url.includes('script.google.com')) return;

  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      const resClone = res.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
      return res;
    }).catch(() => cached))
  );
});
