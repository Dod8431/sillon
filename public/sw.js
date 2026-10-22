// Service worker de Sillon : l'interface marche hors ligne (les données sont dans IndexedDB).
// Jamais de cache pour GitHub ni Spotify : ces appels passent toujours par le réseau.
const CACHE = "sillon-v1";
const BASE = new URL(self.registration.scope).pathname; // "/sillon/"

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll([BASE, BASE + "manifest.webmanifest", BASE + "icon.svg", BASE + "icons/icon-192.png"])).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const isFont = url => url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  if (!same && !isFont(url)) return; // API GitHub / Spotify : réseau direct

  // Pages : réseau d'abord (pour recevoir les mises à jour), sinon la version en cache.
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(BASE, copy)); return res; })
      .catch(() => caches.match(BASE)));
    return;
  }
  // Fichiers versionnés (assets/…-hash.js) et polices : cache d'abord.
  if ((same && url.pathname.startsWith(BASE + "assets/")) || isFont(url)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; })));
    return;
  }
  // Le reste (icônes, manifest) : cache puis mise à jour en arrière-plan.
  e.respondWith(caches.match(req).then(hit => {
    const net = fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; }).catch(() => hit);
    return hit || net;
  }));
});
