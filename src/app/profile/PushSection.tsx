'use client';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { usePushSubscription, type PushStatus } from '@/lib/push/usePushSubscription';

const COPY: Record<PushStatus, string> = {
  loading: '상태를 확인하는 중입니다.',
  subscribed: '이 기기에서 알림을 받고 있어요.',
  available: '꺼져 있어요.',
  denied: '브라우저 설정에서 알림을 허용한 뒤 다시 시도하세요.',
  'ios-install-required': '홈 화면에 추가한 뒤 켤 수 있어요.',
  unsupported: '이 브라우저는 푸시 알림을 지원하지 않아요.',
};

export function PushSection() {
  const { status, subscribe, unsubscribe, busy } = usePushSubscription();
  const toast = useToast();
  const enable = async () => { const err = await subscribe(); if (err) toast(err, 'error'); else toast('푸시 알림을 켰습니다.'); };
  const disable = async () => { await unsubscribe(); toast('푸시 알림을 껐습니다.'); };
  return (
    <section className="rounded-2xl border border-slate-200 p-4">
      <h2 className="font-semibold">푸시 알림</h2>
      <p className="mt-1 text-sm text-slate-600">{COPY[status]}</p>
      {status === 'available' && <Button type="button" className="mt-3" loading={busy} onClick={enable}>켜기</Button>}
      {status === 'subscribed' && <Button type="button" variant="secondary" className="mt-3" loading={busy} onClick={disable}>끄기</Button>}
    </section>
  );
}
