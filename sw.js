// Peak Ride service worker. Bump VERSION whenever you upload a new index.html,
// otherwise phones keep the old cached copy.
const VERSION = 'peakride-v35';
// Three games share this website: Cycling (this folder), Balance Lab (balance/) and Skiing (ski/,
// which has its own service worker). Each worker only ever deletes its own old caches.
const CORE = ['./', './index.html', './manifest.json', './icon-180.png', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE).then(() => c.add('./balance/index.html').catch(() => {}))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.indexOf('peakride-v') === 0 && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate') {
    // each game page is stored under its own address (index.html, balance/index.html, ski/index.html)
    const page = new URL(url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname, url.origin).href;
    // newest page from the network, but a slow or missing connection (a lab with weak wifi)
    // falls back to the stored copy after 4 seconds
    e.respondWith(new Promise(resolve => {
      let done = false;
      const fallback = () => caches.match(page).then(hit => { if (hit && !done) { done = true; resolve(hit); } return hit; });
      const timer = setTimeout(fallback, 4000);
      fetch(req).then(res => {
        clearTimeout(timer);
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(page, copy)); }
        if (!done) { done = true; resolve(res); }
      }).catch(() => { clearTimeout(timer); fallback().then(hit => { if (!done) { done = true; resolve(hit || Response.error()); } }); });
    }));
    return;
  }
  // camera body tracking (MediaPipe library + pose model): download once, then keep
  if ((url.hostname === 'cdn.jsdelivr.net' && (url.pathname.includes('@mediapipe/') || url.pathname.includes('/three@'))) || (url.hostname === 'storage.googleapis.com' && url.pathname.includes('mediapipe-models'))) {
    e.respondWith(caches.open('peakride-mediapipe').then(c => c.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }))));
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(VERSION).then(c => c.match(req).then(hit => { const net = fetch(req).then(res => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => hit); return hit || net; })));
    return;
  }
  if (url.origin === self.location.origin) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return res; })));
  }
});
