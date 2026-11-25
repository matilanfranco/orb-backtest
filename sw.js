/* Service worker: guarda la app para que abra sin internet.
   Estrategia "primero la red": con internet siempre trae la versión nueva (y la guarda);
   sin internet, o si la red tarda más de 4 segundos, responde con lo guardado.
   Al cambiar la lista de archivos, subir el número de CACHE para limpiar la caché vieja. */
const CACHE = 'orb-bt-v2';
const NET_TIMEOUT = 4000;
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './js/stats.js',
  './js/store.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  // cache: 'reload' evita que se guarde una copia vieja del caché HTTP del navegador.
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // no-cache: siempre pregunta al servidor si hay versión nueva (no usa la copia de 10 min de GitHub Pages).
    const network = fetch(req, { cache: 'no-cache' })
      .then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; })
      .catch(() => null);
    const timeout = new Promise((resolve) => setTimeout(() => resolve(null), NET_TIMEOUT));
    const fresh = await Promise.race([network, timeout]);
    if (fresh) return fresh;
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
    return (await network) || (await cache.match('./index.html')) || Response.error();
  })());
});
