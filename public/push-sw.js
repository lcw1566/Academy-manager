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
