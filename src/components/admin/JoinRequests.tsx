'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { reviewJoinRequest } from '@/actions/join';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';

export type JoinRequestItem = { id: string; userId: string; nickname: string; avatarUrl: string | null; createdAt: string };

export function JoinRequests({ items }: { items: JoinRequestItem[] }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  if (items.length === 0) return <EmptyState title="대기 중인 참여 요청이 없습니다" />;
  return (
    <ul className="divide-y divide-slate-200">
      {items.map((r) => (
        <li key={r.id} className="flex items-center gap-3 py-3">
          <Avatar src={r.avatarUrl} name={r.nickname} />
          <div className="flex-1 min-w-0">
            <p className="truncate font-medium">{r.nickname}</p>
            <p className="text-xs text-slate-500">{new Date(r.createdAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</p>
          </div>
          <Button variant="secondary" disabled={pending} onClick={() => start(async () => {
            const res = await reviewJoinRequest(r.id, false);
            if (res.error) toast(res.error, 'error'); else { toast('거절했습니다.'); router.refresh(); }
          })}>거절</Button>
          <Button disabled={pending} onClick={() => start(async () => {
            const res = await reviewJoinRequest(r.id, true);
            if (res.error) toast(res.error, 'error'); else { toast('승인했습니다.'); router.refresh(); }
          })}>승인</Button>
        </li>
      ))}
    </ul>
  );
}
