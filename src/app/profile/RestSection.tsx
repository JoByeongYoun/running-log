'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { requestRest, cancelRestRequest, endMyRest } from '@/actions/rest';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { RestChip } from '@/components/ui/RestChip';
import { useToast } from '@/components/ui/Toast';

type Props = {
  groupName: string | null;
  resting: boolean;
  restStartedAt: string | null;
  pendingRequest: { id: string; reason: string | null; createdAt: string } | null;
};

/** 프로필 > 휴식(평가 일시 제외) 신청·취소·복귀 */
export function RestSection({ groupName, resting, restStartedAt, pendingRequest }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  if (!groupName) return null;

  function run(fn: () => Promise<{ error?: string }>, done: string) {
    start(async () => {
      const res = await fn();
      if (res.error) { toast(res.error, 'error'); return; }
      setOpen(false); toast(done); router.refresh();
    });
  }

  const fmt = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });

  return (
    <section className="rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">휴식</h2>
        {resting && <RestChip />}
      </div>
      {resting ? (
        <>
          <p className="mt-1 text-sm text-slate-600">
            {restStartedAt ? `${fmt(restStartedAt)}부터 ` : ''}휴식 중입니다. 주간 평가에서 제외되며, 기록 등록은 계속 할 수 있습니다.
          </p>
          <Button type="button" className="mt-3" loading={pending} onClick={() => run(endMyRest, '복귀했습니다. 이번 주부터 다시 평가 대상입니다.')}>복귀하기</Button>
        </>
      ) : pendingRequest ? (
        <>
          <p className="mt-1 text-sm text-slate-600">{fmt(pendingRequest.createdAt)}에 신청한 휴식이 관리자 승인을 기다리고 있습니다.</p>
          {pendingRequest.reason && <p className="mt-1 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">{pendingRequest.reason}</p>}
          <Button type="button" variant="secondary" className="mt-3" loading={pending} onClick={() => run(() => cancelRestRequest(pendingRequest.id), '신청을 취소했습니다.')}>신청 취소</Button>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-slate-600">부상·출장 등으로 당분간 참여가 어렵다면 휴식을 신청하세요. 관리자가 승인하면 주간 평가에서 제외됩니다.</p>
          <Button type="button" variant="secondary" className="mt-3" onClick={() => setOpen(true)}>휴식 신청</Button>
        </>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="휴식을 신청할까요?">
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>승인되면 이번 주부터 주간 평가(성공/실패·순위)에서 제외됩니다.</li>
          <li>기록 등록과 그룹 열람은 계속 할 수 있습니다.</li>
          <li>복귀는 승인 없이 언제든 할 수 있습니다.</li>
        </ul>
        <label className="mt-4 block text-sm">
          <span className="text-slate-700">사유 (선택)</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={200}
            rows={3}
            placeholder="예: 2주간 해외 출장"
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
          />
          <span className="block text-right text-xs text-slate-400">{reason.length}/200</span>
        </label>
        <div className="mt-5 flex gap-2">
          <Button type="button" variant="secondary" full onClick={() => setOpen(false)}>취소</Button>
          <Button type="button" full loading={pending} onClick={() => run(() => requestRest(reason), '휴식을 신청했습니다. 관리자 승인을 기다려 주세요.')}>신청</Button>
        </div>
      </Modal>
    </section>
  );
}
