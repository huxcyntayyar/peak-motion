// Peak Motion service worker.
// RULE: bump VERSION below every time you upload a new index.html, and upload sw.js together with it
// (the file must be named exactly "sw.js"; a copy called sw-v100.js is never used by the browser).
const VERSION = 'peakride-v103';
// Everything the app needs offline. Stored one by one, so one failed download (weak wifi) never
// stops the whole worker from installing.
const CORE = ['./index.html', './manifest.json', './icon-180.png', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(CORE.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => /^peakride-v\d/.test(k) && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => {
  const d = e.data || {};
  if (d.type === 'SKIP_WAITING') self.skipWaiting();
  if (d.type === 'GET_VERSION' && e.source) e.source.postMessage({ type: 'VERSION', version: VERSION });
});

// Ask the website, but always re-check with the server (cache: 'no-cache' = "is my copy still current?").
// GitHub Pages tells browsers to keep files for 10 minutes; this skips that wait, so a new upload shows at once.
function fresh(req) { return fetch(req, { cache: 'no-cache' }); }

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate') {
    const page = new URL(url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname, url.origin).href;
    // newest page from the network. Only when the server does not answer within 8 seconds (or is
    // offline) is the stored copy used, and the fresh copy is still saved for the next visit.
    e.respondWith(new Promise(resolve => {
      let done = false;
      const fallback = () => caches.match(page).then(hit => { if (hit && !done) { done = true; resolve(hit); } return hit; });
      const timer = setTimeout(fallback, 8000);
      fresh(req).then(res => {
        clearTimeout(timer);
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(page, copy)); }
        if (!done) { done = true; resolve(res); }
      }).catch(() => { clearTimeout(timer); fallback().then(hit => { if (!done) { done = true; resolve(hit || Response.error()); } }); });
    }));
    return;
  }
  // camera body tracking (MediaPipe library + pose model) and other libraries: download once, then keep
  if ((url.hostname === 'cdn.jsdelivr.net' && (url.pathname.includes('@mediapipe/') || url.pathname.includes('/three@'))) || (url.hostname === 'storage.googleapis.com' && url.pathname.includes('mediapipe-models')) || (url.hostname === 'cdnjs.cloudflare.com' && /\/(html2canvas|jspdf)\//.test(url.pathname))) {
    e.respondWith(caches.open('peakride-mediapipe').then(c => c.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }))));
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(VERSION).then(c => c.match(req).then(hit => { const net = fetch(req).then(res => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => hit); return hit || net; })));
    return;
  }
  // the 3D people (.glb): always ask the website first; the stored copy is only for no connection
  if (url.origin === self.location.origin && url.pathname.endsWith('.glb')) {
    e.respondWith(fresh(req).then(res => {
      if (res.ok) { const a = res.clone(), b = res.clone(); caches.open(VERSION).then(c => c.put(req, a)); caches.open('peakride-assets').then(c => c.put(req, b)); }
      return res;
    }).catch(() => caches.match(req).then(hit => hit || Response.error())));
    return;
  }
  // everything else on this website (icons, manifest, ...): newest first, stored copy only when offline
  if (url.origin === self.location.origin) {
    e.respondWith(fresh(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(hit => hit || Response.error())));
  }
});
