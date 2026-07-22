const CACHE = 'mymanager-v3';
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/')));
    return;
  }
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (!response.ok || response.type === 'opaque') return response;

    // Clone before yielding: the browser may consume the original body as soon as it is returned.
    const cacheResponse = response.clone();
    const cache = await caches.open(CACHE);
    await cache.put(request, cacheResponse);
    return response;
  })());
});

self.addEventListener('push', (event) => {
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    if (windows.some((client) => client.visibilityState === 'visible')) return;
    return self.registration.showNotification('MyManager', {
      body: '予定していたタスクの時間です。今日の一歩を進めましょう。',
      icon: '/icons/icon.svg',
      badge: '/icons/icon.svg',
      tag: 'mymanager-reminder',
      data: { url: '/' },
    });
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    const existing = windows.find((client) => 'focus' in client);
    return existing ? existing.focus() : clients.openWindow(event.notification.data?.url || '/');
  }));
});
