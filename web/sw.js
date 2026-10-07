/**
 * Makes the POS and the warehouse system open with the internet down.
 *
 * The website's own files: network first, so a new version is used as soon
 * as it is online, the cached copy when it is not. Firebase's SDK from
 * Google's CDN: cache first -- its address includes its version, so a cached
 * copy is never out of date. Data is not touched here; Firestore keeps its
 * own offline copy and sends queued sales when the connection returns.
 */
const CACHE = 'stockcheck-pos-v5';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/pos/', '/pos/index.html', '/css/pos.css', '/js/main.js', '/warehouse/', '/warehouse/index.html', '/css/wh.css', '/wh/main.js'])).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
    event.respondWith(caches.match(request).then((hit) => hit || fetch(request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(request, copy));
      return res;
    })));
    return;
  }

  // Only this site's own files; Firebase's reserved /__/ paths stay live.
  if (url.origin !== self.location.origin || url.pathname.startsWith('/__/')) return;
  // Guide videos are large and only watched online; keeping them would fill the phone.
  if (url.pathname.startsWith('/videos/')) return;
  event.respondWith(fetch(request).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(request, copy));
    }
    return res;
  }).catch(() => caches.match(request).then((hit) => hit || (url.pathname.startsWith('/pos') ? caches.match('/pos/index.html')
    : url.pathname.startsWith('/warehouse') ? caches.match('/warehouse/index.html') : undefined))));
});
