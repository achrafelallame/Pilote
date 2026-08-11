/* Service worker Pilote — cache-first pour un fonctionnement 100 % hors ligne */
const CACHE = "pilote-v1";
const FICHIERS = [".", "index.html", "app.js", "parsers.js", "manifest.webmanifest",
  "vendor/pdf.min.js", "vendor/pdf.worker.min.js", "vendor/chart.umd.js", "vendor/xlsx.full.min.js",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  e.respondWith(caches.match(e.request, {ignoreSearch:true}).then(r => r || fetch(e.request)));
});
