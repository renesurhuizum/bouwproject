// Lichte service worker voor offline gebruik op de bouwplaats.
// Strategie:
//  - install: alle routes pre-cachen én hun /_next/static-verwijzingen
//    (uit de HTML geparsed), zodat elke pagina offline werkt — ook als
//    die nooit online is bezocht
//  - navigaties: network-first met cache-fallback (zodat de app offline opent)
//  - statische assets (_next/static, fonts, afbeeldingen): cache-first
// De projectdata zelf staat in IndexedDB (Dexie) en is altijd lokaal beschikbaar.

const VERSION = "v2";
const SHELL_CACHE = `shell-${VERSION}`;
const ASSET_CACHE = `assets-${VERSION}`;
const SHELL_URLS = [
  "/",
  "/plattegrond",
  "/3d",
  "/aanzichten",
  "/werkblad",
  "/fases",
  "/kosten",
  "/instellingen",
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-maskable.svg",
  "/icon-192.png",
  "/icon-512.png",
];

// Haal /_next/static-URL's uit een HTML-document, zodat de chunks van een
// route ook zonder bezoek in de cache komen.
function extractStaticUrls(html) {
  const urls = new Set();
  const re = /\/_next\/static\/[^"'\\ >]+/g;
  for (const m of html.matchAll(re)) urls.add(m[0]);
  return [...urls];
}

async function precache() {
  const shell = await caches.open(SHELL_CACHE);
  const assets = await caches.open(ASSET_CACHE);
  const staticUrls = new Set();

  await Promise.all(
    SHELL_URLS.map(async (url) => {
      try {
        const res = await fetch(url, { cache: "no-cache" });
        if (!res.ok) return;
        if ((res.headers.get("content-type") || "").includes("text/html")) {
          const html = await res.clone().text();
          for (const u of extractStaticUrls(html)) staticUrls.add(u);
        }
        await shell.put(url, res);
      } catch {
        // Offline of route ontbreekt: stil overslaan; runtime-caching vangt op.
      }
    }),
  );

  await Promise.all(
    [...staticUrls].map(async (url) => {
      if (await assets.match(url)) return;
      try {
        const res = await fetch(url);
        if (res.ok) await assets.put(url, res);
      } catch {
        // Stil overslaan.
      }
    }),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache());
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
          const cached =
            (await caches.match(req)) ??
            // Query strings (bijv. ?_rsc=) negeren bij de fallback-match.
            (await caches.match(url.pathname));
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
