'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { leaveGroup } from '@/actions/group';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

export function LeaveGroupSection({ groupName, isAdmin, hasOtherMembers }: { groupName: string | null; isAdmin: boolean; hasOtherMembers: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  if (!groupName) return null;
  const blocked = isAdmin && hasOtherMembers;
  return (
    <section className="rounded-2xl border border-red-200 p-4">
      <h2 className="font-semibold">그룹 탈퇴</h2>
      <p className="mt-1 text-sm text-slate-600">현재 그룹: {groupName}</p>
      {blocked && <p className="mt-2 text-sm text-red-600">관리자는 다른 멤버에게 권한을 위임한 뒤 탈퇴할 수 있습니다.</p>}
      <Button type="button" variant="danger" className="mt-3" disabled={blocked} onClick={() => setOpen(true)}>탈퇴하기</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="그룹을 탈퇴할까요?">
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>지금까지의 기록·사진·댓글은 그룹에 남습니다.</li>
          <li>탈퇴 후에는 그룹의 기록을 더 이상 볼 수 없습니다.</li>
          <li>이번 주 평가 대상이었다면 이번 주 결과에는 계속 포함됩니다.</li>
          <li>다시 참여하려면 관리자 승인이 필요합니다.</li>
        </ul>
        <div className="mt-5 flex gap-2">
          <Button type="button" variant="secondary" full onClick={() => setOpen(false)}>취소</Button>
          <Button type="button" variant="danger" full loading={pending} onClick={() => start(async () => {
            const res = await leaveGroup();
            if (res.error) { toast(res.error, 'error'); return; }
            setOpen(false);
            toast('그룹에서 탈퇴했습니다.');
            router.push('/');
          })}>탈퇴</Button>
        </div>
      </Modal>
    </section>
  );
}
