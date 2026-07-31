/**
 * BETESE Aviator service worker.
 *
 * Intentionally MINIMAL: it exists so browsers treat the site as an installable
 * PWA (Add to Home Screen / Install app). It deliberately does NOT cache pages or
 * API responses — this is a live, real-money game where stale balances, odds, or
 * game state would be dangerous. Every request goes straight to the network.
 *
 * Bump CACHE_VERSION only if you later add caching and need to invalidate it.
 */
const CACHE_VERSION = "v1";

self.addEventListener("install", (event) => {
  // Activate this SW immediately instead of waiting for old tabs to close.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Clean up any caches from a previous version.
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

// Network-only passthrough. Present so the install criteria are satisfied, but it
// never serves cached content — the live app always talks to the server.
self.addEventListener("fetch", (event) => {
  return;
});
