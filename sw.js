// Service worker: makes single-player work offline after the first visit.
const VERSION = 'mq-v6';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/style.css',
  './js/app.js', './js/router.js', './js/state.js', './js/db.js', './js/i18n.js', './js/ui.js', './js/art.js', './js/audio.js',
  './js/adaptive.js', './js/content.js', './js/inputs.js', './js/mission.js', './js/world.js', './js/meta.js', './js/parent.js',
  './js/mp.js', './js/arena.js', './js/little.js', './shared/littlegen.js', './js/net.js', './js/config.js', './js/qr.js',
  './shared/rng.js', './shared/fraction.js', './shared/mathgen.js',
  './vendor/fonts/bpmf-huninn/400.css', './vendor/qrcode.mjs', './vendor/peerjs.min.js', './shared/room-logic.js',
  './icons/icon.svg', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // multiplayer traffic goes straight to the network
  if (url.pathname.includes('/api/')) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => {
      const net = fetch(e.request).then((res) => {
        if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
        return res;
      }).catch(() => hit);
      return hit || net; // cache first; fonts and other files are cached the first time they load
    }),
  );
});
