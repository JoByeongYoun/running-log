'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';

export function ServiceWorker() {
  const [waiting, setWaiting] = useState<globalThis.ServiceWorker | null>(null);
  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return;
    let reg: ServiceWorkerRegistration | undefined;
    navigator.serviceWorker.register('/sw.js').then((r) => {
      reg = r;
      if (r.waiting) setWaiting(r.waiting);
      r.addEventListener('updatefound', () => {
        const sw = r.installing;
        sw?.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) setWaiting(sw);
        });
      });
    }).catch(() => {});
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
    return () => { void reg; };
  }, []);
  if (!waiting) return null;
  return (
    <div role="status" className="fixed inset-x-3 top-3 z-50 flex items-center justify-between gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg">
      <span>새 버전이 있습니다. 작성 중인 내용이 없을 때 새로고침하세요.</span>
      <Button variant="secondary" onClick={() => waiting.postMessage({ type: 'SKIP_WAITING' })}>새로고침</Button>
    </div>
  );
}
