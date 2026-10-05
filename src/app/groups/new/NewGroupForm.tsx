'use client';
import { useActionState } from 'react';
import { createGroup } from '@/actions/group';
import type { ActionState } from '@/actions/auth';
import { Input, Textarea } from '@/components/ui/Input';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { FormMessage } from '@/components/ui/FormMessage';
import { DEFAULT_FREE_MIN_METERS, DEFAULT_PENALTY_PER_KM_WON, DEFAULT_ZERO_KM_PENALTY_WON } from '@/lib/domain/constants';
import { formatMeters } from '@/lib/domain/distance';

export function NewGroupForm({ disabled }: { disabled: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(createGroup, {});
  return (
    <form action={action} className="space-y-5">
      <Input label="그룹명" name="name" required minLength={2} maxLength={30} hint="2~30자" />
      <Input label="열정러너 주간 목표 (km)" name="target" inputMode="decimal" required placeholder="예: 15" hint="0.01 ~ 1,000km, 소수 둘째 자리까지. 순위 내기에 참여하는 기본 유형입니다." />
      <Input label="자유러너 주간 최소 거리 (km)" name="freeMin" inputMode="decimal" required defaultValue={formatMeters(DEFAULT_FREE_MIN_METERS)} hint="순위 없이 최소 거리만 채우는 유형" />
      <Input label="미달 1km당 벌금 (원)" name="perKmWon" inputMode="numeric" required defaultValue={DEFAULT_PENALTY_PER_KM_WON.toLocaleString('ko-KR')} hint="미달 거리는 1km 단위로 올림" />
      <Input label="0km 벌금 (원)" name="zeroWon" inputMode="numeric" required defaultValue={DEFAULT_ZERO_KM_PENALTY_WON.toLocaleString('ko-KR')} hint="한 번도 안 달리면 km당 벌금 대신 이 금액" />
      <Textarea label="벌칙 메모 (선택)" name="penalty" maxLength={500} rows={2} hint="정산 방법 등. 비워도 됩니다." />
      <p className="text-xs text-slate-500">그룹을 만든 주는 준비 주간입니다. 다음 주부터 성공·실패를 평가합니다. 멤버 유형(열정/자유/부상)은 관리자 화면에서 바꿉니다.</p>
      <FormMessage error={state.error} />
      <SubmitButton full disabled={disabled}>그룹 만들기</SubmitButton>
    </form>
  );
}
