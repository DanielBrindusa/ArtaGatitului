const CACHE_NAME = "arta-gatitului-1780384488511";
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
  "assets/js/recipes.js",
  "assets/js/site.js",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
  "portofoliu/",
  "randomizer/",
  "fel-principal/",
  "categorie/fel-principal/",
  "fel-secundar/",
  "categorie/fel-secundar/",
  "desert/",
  "categorie/desert/",
  "rontaieli/",
  "categorie/rontaieli/",
  "salate/",
  "categorie/salate/",
  "bauturi/",
  "categorie/bauturi/",
  "mic-dejun/",
  "categorie/mic-dejun/",
  "retete/ciorba-de-fasole/",
  "retete/supa-de-pui-cu-galuste/",
  "retete/carne-cu-varza-murata/",
  "retete/cartofi-prajiti-cu-sos/",
  "retete/chiftele-de-pui/",
  "retete/conopida-cu-orez-1/",
  "retete/dovlecel-pane/",
  "retete/fajitas-de-pui/",
  "retete/gulas-cu-spaetzle/",
  "retete/mancare-de-mazare-cu-pui/",
  "retete/peste-cu-cartofi-natur/",
  "retete/pui-cu-lamaie-si-cartofi/",
  "retete/pui-dulce-acrisor-cu-orez/",
  "retete/pulpe-de-pui-cu-orzo/",
  "retete/rata-la-cuptor-umpluta/",
  "retete/snitel-pufos-de-pui/",
  "retete/shakshuka/",
  "retete/steak-de-vita/",
  "retete/tocanita-de-cartofi/",
  "retete/tocanita-de-pui-cu-ardei/",
  "retete/placinta-cu-dovleac/",
  "retete/charcuterie-board/",
  "retete/fructe-cu-nutella/",
  "retete/mar-cu-unt-de-arahide/",
  "retete/paine-prajita-unt-arahide/",
  "retete/salata-de-ciuperci/",
  "retete/avocado-cu-bacon/",
  "retete/bagheta-bistro/",
  "retete/clatite-cu-mere/",
  "retete/gris-cu-lapte-si-cocos/",
  "retete/omleta-cu-spanac/",
  "retete/ou-posat-cu-avocado/",
  "retete/ovaz-cu-lapte/",
  "retete/ovaz-peste-noapte/",
  "retete/sandwitch-cu-mozzarella/",
  "retete/sandwitch-cu-ton/",
  "retete/toast-cu-ou-si-avocado/"
];
const OFFLINE_URL = "offline.html";

function cacheUrl(path) {
  return new URL(path, self.registration.scope).toString();
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS.map(cacheUrl)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith("arta-gatitului-") && key !== CACHE_NAME)
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
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || caches.match(cacheUrl(OFFLINE_URL));
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request)
      .then((cached) => cached || fetch(request)
        .then((response) => {
          if (!response || response.status !== 200) return response;
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => cached))
  );
});
