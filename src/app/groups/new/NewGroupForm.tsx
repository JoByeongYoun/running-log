'use client';
import { useActionState } from 'react';
import { createGroup } from '@/actions/group';
import type { ActionState } from '@/actions/auth';
import { Input, Textarea } from '@/components/ui/Input';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { FormMessage } from '@/components/ui/FormMessage';

export function NewGroupForm({ disabled }: { disabled: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(createGroup, {});
  return (
    <form action={action} className="space-y-5">
      <Input label="그룹명" name="name" required minLength={2} maxLength={30} hint="2~30자" />
      <Input label="1인당 주간 목표 거리 (km)" name="target" inputMode="decimal" required placeholder="예: 20" hint="0.01 ~ 1,000km, 소수 둘째 자리까지" />
      <Textarea label="실패 시 벌칙" name="penalty" required maxLength={500} rows={3} hint="1~500자. 벌칙이 없으면 '없음'" />
      <p className="text-xs text-slate-500">그룹을 만든 주는 준비 주간입니다. 다음 주부터 성공·실패를 평가합니다.</p>
      <FormMessage error={state.error} />
      <SubmitButton full disabled={disabled}>그룹 만들기</SubmitButton>
    </form>
  );
}
