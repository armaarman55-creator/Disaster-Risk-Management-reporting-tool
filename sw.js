const CACHE = 'drmsa-v2-20260325c';
const SHELL = [
  '/', '/index.html',
  '/manifest.json',
  '/css/main.css', '/css/auth.css', '/css/dashboard.css',
  '/css/community.css', '/css/sitrep.css', '/css/mopup.css',
  '/css/share.css', '/css/onboarding.css',
  '/js/app.js', '/js/supabase.js', '/js/auth.js', '/js/onboarding.js',
  '/js/dashboard.js', '/js/hvc.js', '/js/community.js', '/js/routes.js',
  '/js/sitrep.js', '/js/mopup.js', '/js/stakeholders.js',
  '/js/share.js', '/js/svg-images.js', '/js/pwa.js',
  '/icons/icon-192.svg', '/icons/icon-512.svg', '/icons/favicon.svg'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Always network-first for Supabase API calls
  if (url.hostname.includes('supabase')) {
    e.respondWith(fetch(request).catch(() => new Response('{"error":"offline"}', { headers: { 'Content-Type': 'application/json' } })));
    return;
  }

  const isSameOrigin = url.origin === self.location.origin;
  const isCriticalAsset =
    request.mode === 'navigate' ||
    url.pathname === '/' ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css');

  // Network-first for HTML/JS/CSS so deploys are picked up immediately
  if (isSameOrigin && isCriticalAsset) {
    e.respondWith(
      fetch(request).then(resp => {
        if (resp && resp.status === 200) {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(request, clone));
        }
        return resp;
      }).catch(() => caches.match(request).then(cached => cached || caches.match('/index.html')))
    );
    return;
  }

  // Cache-first for remaining same-origin assets
  e.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(resp => {
        if (resp && resp.status === 200) {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(request, clone));
        }
        return resp;
      }).catch(() => caches.match('/index.html'));
    })
  );
});
