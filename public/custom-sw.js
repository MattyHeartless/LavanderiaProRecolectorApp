/* global self, clients */
importScripts('./ngsw-worker.js');

self.addEventListener('push', (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'LavanderíaPro';
  const options = {
    body: payload.body || 'Tienes una nueva actualización.',
    icon: payload.icon || '/icons/icon-192x192.png',
    badge: payload.badge || '/icons/icon-72x72.png',
    tag: payload.tag || 'lavanderiapro-notification',
    renotify: Boolean(payload.renotify),
    data: { url: payload.url || '/app/pedidos' }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/app/pedidos', self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const existingWindow = windows.find((client) => client.url.startsWith(self.location.origin));
      return existingWindow ? existingWindow.focus().then(() => existingWindow.navigate(targetUrl)) : clients.openWindow(targetUrl);
    })
  );
});
