'use client';
import { useCallback, useEffect, useState } from 'react';
import { deletePushSubscription, hasPushSubscription, savePushSubscription } from '@/actions/push';

export type PushStatus = 'loading' | 'unsupported' | 'ios-install-required' | 'denied' | 'available' | 'subscribed';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function isIosSafariBrowserTab(): boolean {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

function supported(): boolean {
  return process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function usePushSubscription() {
  const [status, setStatus] = useState<PushStatus>('loading');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!supported()) { setStatus(isIosSafariBrowserTab() ? 'ios-install-required' : 'unsupported'); return; }
    if (Notification.permission === 'denied') { setStatus('denied'); return; }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub && (await hasPushSubscription(sub.endpoint))) { setStatus('subscribed'); return; }
    setStatus('available');
  }, []);

  useEffect(() => { queueMicrotask(() => { void refresh(); }); }, [refresh]);

  const subscribe = useCallback(async (): Promise<string | null> => {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { await refresh(); return permission === 'denied' ? '알림 권한이 거부되었습니다.' : null; }
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) return '푸시 설정이 완료되지 않았습니다.';
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key).buffer as ArrayBuffer }));
      const json = sub.toJSON();
      const result = await savePushSubscription({ endpoint: sub.endpoint, keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' }, userAgent: navigator.userAgent.slice(0, 300) });
      if (!result.ok) { await sub.unsubscribe(); return result.error; }
      setStatus('subscribed');
      return null;
    } catch {
      return '푸시 알림을 켜지 못했습니다. 잠시 후 다시 시도하세요.';
    } finally { setBusy(false); }
  }, [refresh]);

  const unsubscribe = useCallback(async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) { await deletePushSubscription(sub.endpoint); await sub.unsubscribe(); }
      setStatus('available');
    } finally { setBusy(false); }
  }, []);

  return { status, subscribe, unsubscribe, busy };
}
