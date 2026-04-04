const CACHE_VERSION = 'flujo-pro-v4';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const BASE_PATH = new URL(self.registration.scope).pathname.replace(/\/$/, '');

function inScope(path) {
  return `${BASE_PATH}${path}`;
}

const APP_SHELL = [
  inScope('/'),
  inScope('/index.html'),
  inScope('/manifest.json'),
  inScope('/libs/chart.umd.min.js'),
  inScope('/libs/xlsx.full.min.js'),
  inScope('/icons/icon-192.png'),
  inScope('/icons/icon-512.png'),
  inScope('/icons/maskable-icon-512.png'),
  inScope('/icons/apple-touch-icon.png')
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll(APP_SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter(name => name.startsWith('flujo-pro-') && name !== STATIC_CACHE && name !== RUNTIME_CACHE)
        .map(name => caches.delete(name))
    );
    await self.clients.claim();
  })());
});

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then(response => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    return cached;
  }

  const networkResponse = await networkPromise;
  if (networkResponse) {
    return networkResponse;
  }

  if (request.mode === 'navigate') {
    const fallback = await caches.match(inScope('/index.html'));
    if (fallback) return fallback;
  }

  return new Response('Offline', {
    status: 503,
    statusText: 'Offline'
  });
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;

  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request);
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(event.request, response.clone()).catch(() => {});
        return response;
      } catch (error) {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        return caches.match(inScope('/index.html'));
      }
    })());
    return;
  }

  if (isSameOrigin) {
    event.respondWith(staleWhileRevalidate(event.request));
  }
});

self.addEventListener('push', event => {
  let data = {
    title: 'Flujo Pro',
    body: 'Tienes una nueva notificacion.',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    url: './'
  };

  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch (error) {
    // Si el payload no es JSON se mantiene el valor por defecto.
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      data: { url: data.url || './' }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || './';

  event.waitUntil((async () => {
    const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = allClients.find(client => {
      try {
        return new URL(client.url).origin === self.location.origin;
      } catch {
        return false;
      }
    });

    if (existing) {
      await existing.focus();
      return existing.navigate(targetUrl);
    }

    return clients.openWindow(targetUrl);
  })());
});
