'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';

export function ServiceWorker() {
  const [waiting, setWaiting] = useState<globalThis.ServiceWorker | null>(null);
  const reloadOnChange = useRef(false);
  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return;
    let disposed = false;
    const cleanups: Array<() => void> = [];
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    navigator.serviceWorker.register('/sw.js').then((r) => {
      if (disposed) return;
      if (r.waiting) {
        setWaiting(r.waiting);
        // A browser reload also accepts an update that was already waiting.
        // Updates discovered later still need the user's button click.
        if (navigation?.type === 'reload') {
          reloadOnChange.current = true;
          r.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      }
      const onUpdateFound = () => {
        const sw = r.installing;
        if (!sw) return;
        const onStateChange = () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) setWaiting(sw);
        };
        sw.addEventListener('statechange', onStateChange);
        cleanups.push(() => sw.removeEventListener('statechange', onStateChange));
      };
      r.addEventListener('updatefound', onUpdateFound);
      cleanups.push(() => r.removeEventListener('updatefound', onUpdateFound));
    }).catch(() => {});
    // 첫 설치 때도 clients.claim()으로 controllerchange가 발생한다. 그때 새로고침하면
    // 사용자가 입력 중이던 폼(로그인 등)이 날아가므로, 이미 제어 중인 워커가 교체될 때만 새로고침한다.
    reloadOnChange.current = Boolean(navigator.serviceWorker.controller);
    let refreshing = false;
    const onControllerChange = () => {
      if (!reloadOnChange.current || refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    return () => {
      disposed = true;
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      cleanups.forEach((cleanup) => cleanup());
    };
  }, []);
  if (!waiting) return null;
  return (
    <div role="status" className="fixed inset-x-3 top-3 z-50 flex items-center justify-between gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg">
      <span>새 버전이 있습니다. 작성 중인 내용이 없을 때 새로고침하세요.</span>
      <Button variant="secondary" onClick={() => { reloadOnChange.current = true; waiting.postMessage({ type: 'SKIP_WAITING' }); }}>새로고침</Button>
    </div>
  );
}
