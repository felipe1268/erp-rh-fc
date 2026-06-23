// Rev. 2895 — Service Worker do ERP FC (PWA / Levantamento Offline no Tablet).
// CACHE_VERSION é substituído em build-time pelo plugin Vite (vite.config.ts).
// Isso garante que cada deploy gere um sw.js diferente → browser instala nova versão.
// Estratégias:
//  • /api/*           → SEMPRE rede (nunca cacheia dados/tRPC).
//  • navegação (HTML) → network-first com fallback ao app shell em cache (offline boot).
//  • /assets/* (hash) → cache-first (imutáveis; o hash muda a cada build).
//  • demais GET same-origin → stale-while-revalidate.

const CACHE = "erp-fc-__SW_BUILD_TS__";
const SHELL = "/";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.add(SHELL).catch(() => {})).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isAsset(url) {
  return url.pathname.startsWith("/assets/") ||
    /\.(?:js|css|woff2?|ttf|png|jpe?g|svg|webp|gif|ico|wasm|json)$/i.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // deixa CORS/object storage passar direto
  if (url.pathname.startsWith("/api/")) return;     // dados nunca pelo SW

  // Navegação (app shell): network-first → cache → shell.
  // cache:'no-store' evita que o HTTP cache do browser sirva HTML antigo (com
  // hashes de chunk velhos) após um deploy → garante sempre o HTML mais recente.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(new Request(req.url, { cache: "no-store", credentials: "same-origin" }))
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(SHELL, copy)).catch(() => {});
          return resp;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match(SHELL))),
    );
    return;
  }

  // Assets versionados: cache-first.
  if (isAsset(url)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((resp) => {
          if (resp && resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return resp;
        });
      }),
    );
    return;
  }

  // Demais GET same-origin: stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((resp) => {
        if (resp && resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return resp;
      }).catch(() => cached);
      return cached || network;
    }),
  );
});
