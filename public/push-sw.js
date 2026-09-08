self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// 네트워크 동작은 바꾸지 않으면서 설치형 PWA가 모든 페이지를 제어하도록 한다.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(fetch(event.request));
});

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    const payload = event.data?.json() || {};
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const visibleClient = clientsList.find((client) => client.visibilityState === 'visible');
    if (visibleClient) return;

    await self.registration.showNotification(payload.title || '새 채팅', {
      body: payload.body || '새 메시지가 도착했어요.',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: payload.threadId ? `chat-${payload.threadId}` : undefined,
      data: { threadId: payload.threadId },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const threadId = event.notification.data?.threadId;
  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (clientsList.length) {
      const client = clientsList[0];
      await client.focus();
      client.postMessage({ type: 'OPEN_CHAT_THREAD', threadId });
      return;
    }
    const query = threadId ? `?chatThread=${encodeURIComponent(threadId)}` : '';
    await self.clients.openWindow(`/${query}`);
  })());
});
