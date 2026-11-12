/* Offline-app: eerst het netwerk (zodat iedereen de nieuwste versie krijgt), anders de bewaarde kopie. */
const CACHE = "floorball-v5";
const CORE = ["./", "index.html", "manifest.webmanifest", "o18/", "gymles/", "o12/", "o14/", "overzicht/",
  "shared/shim.js", "shared/config.js", "shared/online.js", "shared/exercises.json",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET") return;
  if (url.hostname.endsWith("supabase.co")) return;          // scores altijd live
  const external = url.origin !== location.origin;
  if (external && !/fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com/.test(url.hostname)) return;
  if (external) {                                              // lettertypes en pdf-bibliotheek: uit de cache als het kan
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res;
    })));
    return;
  }
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then(hit => hit || caches.match("index.html"))));
});
