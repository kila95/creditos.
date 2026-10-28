// Service Worker Oficial EnRuta PWA (/sw.js)
// Gestiona caché de App Shell para operación sin señal y coordina Background Sync con IndexedDB

const CACHE_NAME = 'enruta-pwa-cache-v1';
const APP_SHELL_ASSETS = ['/', '/index.html', '/manifest.json', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL_ASSETS))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
          return Promise.resolve();
        })
      )
    )
  );
  self.clients.claim();
});

// Estrategia Network-First con fallback a Cache para navegación y recursos estáticos
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const cloned = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
        }
        return networkResponse;
      })
      .catch(async () => {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) return cachedResponse;
        if (request.mode === 'navigate') {
          return caches.match('/index.html');
        }
        return new Response('Offline', { status: 503 });
      })
  );
});

// Evento Background Sync: notifica a los clientes activos que sincronicen IndexedDB -> Supabase
self.addEventListener('sync', (event) => {
  if (event.tag === 'enruta-sync-offline-payments') {
    event.waitUntil(notifyClientsToSync());
  }
});

// Escucha mensajes directos desde la aplicación React
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'TRIGGER_OFFLINE_SYNC') {
    event.waitUntil(notifyClientsToSync());
  }
});

async function notifyClientsToSync() {
  const allClients = await self.clients.matchAll({
    includeUncontrolled: true,
    type: 'window',
  });
  for (const client of allClients) {
    client.postMessage({
      type: 'SW_SYNC_INDEXEDDB_NOW',
      timestamp: new Date().toISOString(),
    });
  }
}
