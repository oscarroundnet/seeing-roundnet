// Seeing Roundnet offline support.
// - The page (index.html) comes from the network first, so a new version shows up as soon as
//   it is online; if the network is missing or too slow (3 s), the saved copy is used.
// - The other files (conversion library, logos, icons, font) come from the saved copy and are
//   refreshed in the background.
// - The "new version" check (?v=...) always goes to the network.
// Nothing about the user's videos goes through here: they never leave the phone.
const CACHE = 'sr-app-v1';
const CORE = ['./', 'index.html', 'mediabunny.min.mjs', 'logo.jpg', 'logo-mark.png', 'icon-180.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('sr-app-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function timeout(ms) { return new Promise((_, ko) => setTimeout(() => ko(new Error('timeout')), ms)); }

async function pageFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await Promise.race([fetch(req), timeout(3000)]);
    if (res && res.ok) cache.put('index.html', res.clone());
    return res;
  } catch (e) {
    return (await cache.match('index.html')) || (await cache.match('./')) || Response.error();
  }
}

async function savedFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, { ignoreSearch: true });
  const refresh = fetch(req).then(res => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return hit || (await refresh) || Response.error();
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const scope = new URL(self.registration.scope);
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!fonts && (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname))) return;
  if (url.searchParams.has('v') || req.cache === 'no-store') return;   // update check: network only
  if (req.mode === 'navigate' || url.pathname === scope.pathname || url.pathname.endsWith('/index.html')) {
    e.respondWith(pageFirst(req)); return;
  }
  e.respondWith(savedFirst(req));
});
