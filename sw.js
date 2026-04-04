const CACHE = 'drmsa-v6';
const SHELL = [
  '/', '/index.html',
  '/manifest.json',
  '/css/main.css', '/css/auth.css', '/css/dashboard.css',
  '/css/community.css', '/css/sitrep.css', '/css/mopup.css',
  '/css/share.css', '/css/risk-map.css',
  '/js/app.js', '/js/supabase.js', '/js/auth.js',
  '/js/dashboard.js', '/js/hvc.js', '/js/community.js', '/js/routes.js',
  '/js/sitrep.js', '/js/mopup.js', '/js/stakeholders.js',
  '/js/share.js', '/js/svg-images.js', '/js/pwa.js', '/js/risk-map.js',
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
  const isNavigation = request.mode === 'navigate' || request.destination === 'document';

  // Always network-first for Supabase API calls
  if (url.hostname.includes('supabase')) {
    e.respondWith(
      fetch(request).catch(
        () => new Response('{"error":"offline"}', { headers: { 'Content-Type': 'application/json' } })
      )
    );
    return;
  }

  const isAppAsset = url.origin === self.location.origin && (
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'document' ||
    /\.(js|css|html)$/i.test(url.pathname)
  );

  if (isAppAsset) {
    // Network-first for app code so users get updates without hard refresh
    e.respondWith(
      fetch(request)
        .then(resp => {
          if (resp && resp.status === 200) {
            const clone = resp.clone();
            caches.open(CACHE).then(c => c.put(request, clone));
          }
          return resp;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          if (isNavigation) return caches.match('/index.html');
          return new Response('Offline', { status: 503, statusText: 'Offline' });
        })
    );
    return;
  }

  // Cache-first for non-code assets
  e.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request)
        .then(resp => {
          if (resp && resp.status === 200 && url.origin === self.location.origin) {
            const clone = resp.clone();
            caches.open(CACHE).then(c => c.put(request, clone));
          }
          return resp;
        })
        .catch(() => new Response('Offline', { status: 503, statusText: 'Offline' }));
    })
  );
});


self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
