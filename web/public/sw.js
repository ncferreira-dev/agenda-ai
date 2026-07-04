/* Service worker do agend.ai — recebe Web Push e abre o painel no clique.
   Payload esperado: { title, body, url }. */

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_e) {
    data = { title: 'agend.ai', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Novo agendamento';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'agenda-novo-agendamento',
    data: { url: data.url || '/painel' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/painel';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Se já tem uma aba do painel aberta, foca nela; senão abre uma nova.
      for (const client of clients) {
        if (client.url.includes('/painel') && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
      return undefined;
    }),
  );
});
