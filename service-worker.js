const CACHE_NAME = "arta-gatitului-mq5bte26";
const CACHE_PREFIX = "arta-gatitului-";
const SHELL_CACHE = CACHE_NAME + "-shell";
const HTML_CACHE = CACHE_NAME + "-html";
const ASSET_CACHE = CACHE_NAME + "-assets";
const IMAGE_CACHE = CACHE_NAME + "-images";
const MAX_IMAGE_CACHE_ITEMS = 60;
const CORE_ASSETS = [
  "./",
  "index.html",
  "cauta.html",
  "ce-pot-gati.html",
  "categorii.html",
  "adauga-reteta.html",
  "offline.html",
  "manifest.json",
  "manifest.webmanifest",
  "assets/css/style.css",
  "assets/css/style.css?v=mq5bte26",
  "assets/js/site.js",
  "assets/js/site.js?v=mq5bte26",
  "assets/data/recipe-index.json",
  "assets/data/recipe-index.json?v=mq5bte26",
  "assets/data/search-index.json",
  "assets/data/search-index.json?v=mq5bte26",
  "assets/data/ingredient-index.json",
  "assets/data/ingredient-index.json?v=mq5bte26",
  "assets/data/categories.json",
  "assets/data/categories.json?v=mq5bte26",
  "assets/data/tag-groups.json",
  "assets/data/tag-groups.json?v=mq5bte26",
  "assets/data/ingredient-aliases.json",
  "assets/data/ingredient-aliases.json?v=mq5bte26",
  "assets/icons/icon.png",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
  "portofoliu/",
  "randomizer/",
  "soon-to-come/"
];
const OFFLINE_URL = "offline.html";

function cacheUrl(path) {
  return new URL(path, self.registration.scope).toString();
}

function isCacheable(response) {
  return response && response.status === 200 && (response.type === "basic" || response.type === "default");
}

async function putIfCacheable(cacheName, request, response) {
  if (!isCacheable(response)) return;
  const cache = await caches.open(cacheName);
  await cache.put(request, response.clone());
}

async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxItems) return;
  await Promise.all(keys.slice(0, keys.length - maxItems).map((request) => cache.delete(request)));
}

async function networkFirstHtml(request) {
  try {
    const response = await fetch(request);
    await putIfCacheable(HTML_CACHE, request, response);
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || caches.match(cacheUrl(OFFLINE_URL));
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cached = await caches.match(request);
  const network = fetch(request)
    .then(async (response) => {
      await putIfCacheable(cacheName, request, response);
      return response;
    })
    .catch(() => cached);
  return cached || network;
}

async function cacheFirstImage(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  await putIfCacheable(IMAGE_CACHE, request, response);
  await trimCache(IMAGE_CACHE, MAX_IMAGE_CACHE_ITEMS);
  return response;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => Promise.all(CORE_ASSETS.map((path) => cache.add(cacheUrl(path)).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && !key.startsWith(CACHE_NAME))
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstHtml(request));
    return;
  }

  if (/\.(?:png|jpe?g|webp|gif|svg|ico)$/i.test(url.pathname)) {
    event.respondWith(cacheFirstImage(request).catch(() => caches.match(request)));
    return;
  }

  if (/\.(?:css|js|json|webmanifest)$/i.test(url.pathname) || url.pathname.includes("/assets/data/")) {
    event.respondWith(staleWhileRevalidate(request, ASSET_CACHE));
    return;
  }

  event.respondWith(staleWhileRevalidate(request, ASSET_CACHE));
});
