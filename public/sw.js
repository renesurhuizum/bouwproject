// Lichte service worker voor offline gebruik op de bouwplaats.
// Strategie:
//  - navigaties: network-first met cache-fallback (zodat de app offline opent)
//  - statische assets (_next/static, fonts, afbeeldingen): cache-first
// De projectdata zelf staat in IndexedDB (Dexie) en is altijd lokaal beschikbaar.

const VERSION = "v1";
const SHELL_CACHE = `shell-${VERSION}`;
const ASSET_CACHE = `assets-${VERSION}`;
const SHELL_URLS = ["/", "/plattegrond", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS).catch(() => {})),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.endsWith(VERSION))
          .map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static") ||
    url.pathname.startsWith("/icon") ||
    /\.(?:js|css|woff2?|png|jpg|jpeg|svg|webp|avif)$/.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigaties: network-first, val terug op cache (app-shell).
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          return cached || (await caches.match("/")) || Response.error();
        }),
    );
    return;
  }

  // Statische assets: cache-first.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(ASSET_CACHE).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
  }
});
