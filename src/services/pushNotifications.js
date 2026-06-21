import { Capacitor } from '@capacitor/core';
import { disablePushDevice, upsertPushDevice } from './supabase/pushApi';

let nativeListenersReady = false;
let actionHandler = null;
const PUSH_TOKEN_KEY = 'seenit-native-push-token';
const PUSH_PROVIDER_KEY = 'seenit-native-push-provider';

function urlBase64ToUint8Array(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

async function registerWebPush() {
  const publicKey = import.meta.env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY;
  if (!publicKey || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
  await navigator.serviceWorker.register('/push-sw.js');
  // 최초 설치 직후에는 registration 객체가 아직 installing/waiting 상태일 수
  // 있다. active worker가 준비되기 전에 subscribe하면 Chrome이
  // "no active Service Worker"로 거부하므로 ready까지 기다린다.
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }
  const token = JSON.stringify(subscription.toJSON());
  await upsertPushDevice({ token, platform: 'web', provider: 'webpush' });
  localStorage.setItem(PUSH_TOKEN_KEY, token);
  localStorage.setItem(PUSH_PROVIDER_KEY, 'webpush');
}

export function isNativePushAvailable() {
  return Capacitor.isNativePlatform();
}

export function getNotificationPermission() {
  if (isNativePushAvailable()) return 'native';
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

export async function checkNotificationPermission() {
  if (!isNativePushAvailable()) return getNotificationPermission();
  const { PushNotifications } = await import('@capacitor/push-notifications');
  const status = await PushNotifications.checkPermissions();
  return status.receive;
}

export async function requestNotificationPermission() {
  if (!isNativePushAvailable()) {
    if (typeof Notification === 'undefined') return 'unsupported';
    const permission = await Notification.requestPermission();
    if (permission === 'granted') await registerWebPush();
    return permission;
  }

  const { PushNotifications } = await import('@capacitor/push-notifications');
  let status = await PushNotifications.checkPermissions();
  if (status.receive === 'prompt' || status.receive === 'prompt-with-rationale') {
    status = await PushNotifications.requestPermissions();
  }
  if (status.receive !== 'granted') return 'denied';
  await ensureNativePushListeners();
  if (Capacitor.getPlatform() === 'android') {
    await PushNotifications.createChannel({
      id: 'chat_messages',
      name: '채팅 메시지',
      description: '새 채팅 메시지 알림',
      importance: 4,
      vibration: true,
    });
  }
  await PushNotifications.register();
  return 'granted';
}

export async function initializePushNotifications(onAction) {
  actionHandler = onAction || null;
  if (!isNativePushAvailable()) {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      await registerWebPush();
    }
    return;
  }
  const { PushNotifications } = await import('@capacitor/push-notifications');
  const status = await PushNotifications.checkPermissions();
  if (status.receive !== 'granted') return;
  await ensureNativePushListeners();
  if (Capacitor.getPlatform() === 'android') {
    await PushNotifications.createChannel({
      id: 'chat_messages',
      name: '채팅 메시지',
      description: '새 채팅 메시지 알림',
      importance: 4,
      vibration: true,
    });
  }
  await PushNotifications.register();
}

async function ensureNativePushListeners() {
  if (nativeListenersReady) return;
  const { PushNotifications } = await import('@capacitor/push-notifications');

  await PushNotifications.addListener('registration', async ({ value }) => {
    const platform = Capacitor.getPlatform();
    const provider = platform === 'ios' ? 'apns' : 'fcm';
    try {
      await upsertPushDevice({ token: value, platform, provider });
      localStorage.setItem(PUSH_TOKEN_KEY, value);
      localStorage.setItem(PUSH_PROVIDER_KEY, provider);
    } catch (err) {
      console.warn('[push] device token save failed', err?.message || err);
    }
  });

  await PushNotifications.addListener('registrationError', (err) => {
    console.warn('[push] native registration failed', err?.error || err);
  });

  await PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
    actionHandler?.(notification?.data || {});
  });

  nativeListenersReady = true;
}

export async function disableCurrentPushDevice() {
  if (typeof localStorage === 'undefined') return;
  const token = localStorage.getItem(PUSH_TOKEN_KEY);
  const provider = localStorage.getItem(PUSH_PROVIDER_KEY);
  if (token && provider) await disablePushDevice(token, provider);
  if (isNativePushAvailable()) {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    await PushNotifications.unregister();
  } else if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.getRegistration('/push-sw.js');
    const subscription = await registration?.pushManager.getSubscription();
    await subscription?.unsubscribe();
  }
  localStorage.removeItem(PUSH_TOKEN_KEY);
  localStorage.removeItem(PUSH_PROVIDER_KEY);
}

export function showForegroundChatNotification({ title, body, threadId, onClick }) {
  if (isNativePushAvailable() || typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  const notification = new Notification(title || '새 채팅', {
    body,
    icon: '/icon-192.png',
    tag: threadId ? `chat-${threadId}` : undefined,
  });
  notification.onclick = () => {
    window.focus();
    notification.close();
    onClick?.();
  };
}
