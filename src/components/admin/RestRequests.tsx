'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { reviewRestRequest } from '@/actions/rest';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

export type RestRequestItem = { id: string; userId: string; nickname: string; avatarUrl: string | null; reason: string | null; createdAt: string };

/** 휴식(평가 일시 제외) 신청 목록. 참여 요청 탭 아래에 붙는다. */
export function RestRequests({ items }: { items: RestRequestItem[] }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  if (items.length === 0) return null;
  return (
    <section className="mt-6">
      <h3 className="mb-1 flex items-center gap-1 font-semibold"><span aria-hidden>💤</span> 휴식 신청 {items.length}건</h3>
      <p className="mb-2 text-xs text-slate-500">승인하면 이번 주부터 주간 평가에서 제외됩니다. 기록 등록은 계속 할 수 있습니다.</p>
      <ul className="divide-y divide-slate-200">
        {items.map((r) => (
          <li key={r.id} className="flex items-center gap-3 py-3">
            <Avatar src={r.avatarUrl} name={r.nickname} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{r.nickname}</p>
              {r.reason && <p className="truncate text-sm text-slate-700">{r.reason}</p>}
              <p className="text-xs text-slate-500">{new Date(r.createdAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</p>
            </div>
            <Button variant="secondary" disabled={pending} onClick={() => start(async () => {
              const res = await reviewRestRequest(r.id, false);
              if (res.error) toast(res.error, 'error'); else { toast('거절했습니다.'); router.refresh(); }
            })}>거절</Button>
            <Button disabled={pending} onClick={() => start(async () => {
              const res = await reviewRestRequest(r.id, true);
              if (res.error) toast(res.error, 'error'); else { toast('휴식을 승인했습니다.'); router.refresh(); }
            })}>승인</Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
