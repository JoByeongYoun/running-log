'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { reviewRecord, type ReviewAction } from '@/actions/review';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';

export function ReviewActions({ recordId, status, version, compact }: { recordId: string; status: 'pending' | 'approved'; version: number; compact?: boolean }) {
  const [ask, setAsk] = useState<ReviewAction | null>(null);
  const [reason, setReason] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function run(action: ReviewAction, r: string | null) {
    start(async () => {
      const res = await reviewRecord(recordId, action, r, version);
      if (res.error) { toast(res.error, 'error'); router.refresh(); return; }
      toast(action === 'approve' ? '승인했습니다.' : action === 'reject' ? '반려했습니다.' : '승인을 취소했습니다.');
      setAsk(null); setReason(''); router.refresh();
    });
  }

  return (
    <div className={compact ? 'flex gap-2' : 'flex gap-2 rounded-2xl border border-slate-200 p-3'}>
      {status === 'pending' ? (
        <>
          <Button variant="secondary" full={!compact} disabled={pending} onClick={() => setAsk('reject')}>반려</Button>
          <Button full={!compact} loading={pending} onClick={() => run('approve', null)}>승인</Button>
        </>
      ) : (
        <Button variant="secondary" full={!compact} disabled={pending} onClick={() => setAsk('unapprove')}>승인 취소</Button>
      )}
      <Modal open={Boolean(ask)} onClose={() => setAsk(null)} title={ask === 'reject' ? '반려 사유' : '승인 취소 사유'}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (ask) run(ask, reason); }}>
          <Textarea label="사유 (작성자에게 표시됩니다)" value={reason} onChange={(e) => setReason(e.target.value)} required maxLength={500} rows={3} />
          <div className="flex gap-2">
            <Button type="button" variant="secondary" full onClick={() => setAsk(null)}>취소</Button>
            <Button type="submit" variant="danger" full loading={pending} disabled={!reason.trim()}>{ask === 'reject' ? '반려' : '승인 취소'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
