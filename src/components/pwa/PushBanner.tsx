'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { usePushSubscription } from '@/lib/push/usePushSubscription';

const KEY = 'push-banner-dismissed';

export function PushBanner() {
  const { status, subscribe, busy } = usePushSubscription();
  const toast = useToast();
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    queueMicrotask(() => {
      try { setDismissed(localStorage.getItem(KEY) === '1'); } catch { setDismissed(false); }
    });
  }, []);
  if (dismissed || (status !== 'available' && status !== 'ios-install-required')) return null;

  const dismiss = () => { try { localStorage.setItem(KEY, '1'); } catch {} setDismissed(true); };
  const enable = async () => {
    const err = await subscribe();
    if (err) toast(err, 'error'); else toast('푸시 알림을 켰습니다.');
  };

  return (
    <div role="status" className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
      <span className="text-slate-700">
        {status === 'available' ? '새 알림을 기기에서 바로 받아보세요.' : '홈 화면에 추가하면 알림을 받을 수 있어요.'}
      </span>
      <div className="flex shrink-0 items-center gap-1">
        {status === 'available' && <Button type="button" variant="primary" className="min-h-9 px-3 text-sm" loading={busy} onClick={enable}>켜기</Button>}
        <button type="button" aria-label="닫기" onClick={dismiss} className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100">×</button>
      </div>
    </div>
  );
}
