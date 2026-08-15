const CACHE = 'ud-20260815102355';
const ASSETS = ['./', './icon-v2.png', './icon-192.png', './icon-512.png', './manifest.webmanifest'];
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// stale-while-revalidate: serve instantly from cache, refresh in the background;
// when a NEWER index lands, tell open pages so they can offer a refresh
// page asks us to download the new build with the page still open,
// so the 12MB fetch can't be killed by a quick app switch
self.addEventListener('message', (e) => {
  if (e.data !== 'ud-refresh') return;
  e.waitUntil((async () => {
    let ok = false;
    try {
      const res = await fetch('./', { cache: 'reload' });
      if (res.ok) {
        const c = await caches.open(CACHE);
        await c.put('./', res);
        ok = true;
      }
    } catch {}
    const cs = await self.clients.matchAll();
    cs.forEach((cl) => cl.postMessage({ udRefreshed: true, ok }));
  })());
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const u = new URL(req.url);
  if (req.method !== 'GET' || u.origin !== location.origin) return;
  if (u.search) return; // version checks etc. always hit the network
  e.respondWith(caches.match(req).then((cached) => {
    const net = fetch(req).then(async (res) => {
      if (res.ok) {
        const clone = res.clone();
        if (req.mode === 'navigate' && cached) {
          const a = cached.headers.get('etag'), b = res.headers.get('etag');
          if (a && b && a !== b) {
            (await self.clients.matchAll()).forEach((cl) => cl.postMessage({ udUpdate: true }));
          }
        }
        caches.open(CACHE).then((c) => c.put(req, clone));
      }
      return res;
    }).catch(() => cached);
    return cached || net;
  }));
});
