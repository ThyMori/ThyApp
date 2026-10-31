// Service worker de ThyApp.
// Stratégie : réseau d'abord (les mises à jour du site apparaissent tout de suite),
// cache en secours (l'app s'ouvre aussi hors connexion).
// Pense à changer VERSION à chaque déploiement important pour renouveler le cache.
const VERSION = 'v11';
const CACHE = 'thyapp-' + VERSION;
const SHELL = [
  './',
  './index.html',
  './jeu-de-la-vie.html',
  './course.html',
  './foot.html',
  './spectacles.html',
  './acces.html',
  './db.js',
  './pen.js',
  './firebase-config.js',
  './vendor/firebase-bundle.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  );
});
