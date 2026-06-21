/* PeSAR service worker — handles Web Push notifications.
 * Kept minimal: no offline caching here (the app already caches via localStorage). */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'PeSAR', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'PeSAR — Alerte taux';
  const options = {
    body: payload.body || '',
    icon: '/logo-dark.png',
    badge: '/logo-dark.png',
    tag: payload.tag || 'pesar-alert',
    data: { url: payload.url || '/' },
    vibrate: [80, 40, 80],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
