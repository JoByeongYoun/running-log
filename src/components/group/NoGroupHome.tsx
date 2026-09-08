'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/States';
import { formatMeters } from '@/lib/domain/distance';
import { cancelJoinRequest } from '@/actions/join';
import { useToast } from '@/components/ui/Toast';
import type { GroupState } from '@/lib/group-state';

export function NoGroupHome({ state }: { state: GroupState }) {
  const [code, setCode] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();

  if (state.pendingRequest) {
    const r = state.pendingRequest;
    return (
      <Card className="space-y-3">
        <h2 className="text-lg font-semibold">{r.groupName}</h2>
        <dl className="text-sm text-slate-700">
          <div className="flex justify-between"><dt>주간 목표</dt><dd>{formatMeters(r.targetMeters)} km</dd></div>
          <div className="flex justify-between"><dt>실패 시 벌칙</dt><dd className="text-right">{r.penalty}</dd></div>
        </dl>
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">관리자 승인을 기다리고 있습니다.</p>
        <Button variant="secondary" full loading={pending} onClick={() => start(async () => {
          const res = await cancelJoinRequest(r.id);
          if (res.error) toast(res.error, 'error'); else { toast('요청을 취소했습니다.'); router.refresh(); }
        })}>요청 취소</Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {state.lastRejected && (
        <p role="status" className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700">
          {state.lastRejected.groupName} 참여 요청이 거절되었습니다. 다른 그룹에 요청하거나 새 그룹을 만들 수 있습니다.
        </p>
      )}
      <Card className="space-y-3">
        <h2 className="font-semibold">그룹 만들기</h2>
        <p className="text-sm text-slate-600">주간 목표와 벌칙을 정하고 친구를 초대하세요.</p>
        <Link href="/groups/new" className="block"><Button full>그룹 만들기</Button></Link>
      </Card>
      <Card className="space-y-3">
        <h2 className="font-semibold">초대 코드로 참여하기</h2>
        <form onSubmit={(e) => { e.preventDefault(); if (code.trim()) router.push(`/join/${encodeURIComponent(code.trim())}`); }} className="space-y-3">
          <Input label="초대 코드" value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="off" autoCorrect="off" required />
          <Button type="submit" variant="secondary" full>그룹 확인</Button>
        </form>
      </Card>
    </div>
  );
}
