/* Oyun Merkezi servis çalışanı (otomatik üretilir: scripts/post-build.js)
   - Tüm dosyaları kuruluşta önbelleğe alır, böylece oyun internetsiz de açılır.
   - Sayfalar önce ağdan istenir (yeni sürüm hemen gelsin), ağ yoksa önbellekten açılır. */
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const CACHE = 'oyun-merkezi-' + VERSION;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        Promise.all(
          PRECACHE.map((path) =>
            cache.add(new Request(new URL(path, self.registration.scope), { cache: 'reload' })).catch(() => {}),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() =>
          caches
            .match(req, { ignoreSearch: true })
            .then((hit) => hit || caches.match(new URL('./', self.registration.scope))),
        ),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
