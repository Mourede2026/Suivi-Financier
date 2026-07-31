// Service worker minimal : met en cache l'app shell (HTML/CSS/JS) pour que
// l'application s'ouvre même sans réseau. Les données (API) ne sont PAS
// mises en cache ici — la gestion hors-ligne des saisies se fait via la
// file d'attente localStorage dans js/api.js.

const NOM_CACHE = 'suivi-finance-v1';
const FICHIERS_A_METTRE_EN_CACHE = [
  './index.html',
  './equipe.html',
  './admin.html',
  './manifest.json',
  './css/style.css',
  './js/config.js',
  './js/session.js',
  './js/api.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (evenement) => {
  evenement.waitUntil(
    caches.open(NOM_CACHE).then((cache) => cache.addAll(FICHIERS_A_METTRE_EN_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (evenement) => {
  evenement.waitUntil(
    caches.keys().then((noms) =>
      Promise.all(noms.filter((n) => n !== NOM_CACHE).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (evenement) => {
  const url = new URL(evenement.request.url);

  // Ne jamais mettre en cache les appels à l'API Google Apps Script.
  if (url.hostname.includes('script.google.com')) return;

  evenement.respondWith(
    caches.match(evenement.request).then((reponseEnCache) => {
      return reponseEnCache || fetch(evenement.request).then((reponseReseau) => {
        return caches.open(NOM_CACHE).then((cache) => {
          if (evenement.request.method === 'GET' && reponseReseau.ok) {
            cache.put(evenement.request, reponseReseau.clone());
          }
          return reponseReseau;
        });
      }).catch(() => reponseEnCache);
    })
  );
});
