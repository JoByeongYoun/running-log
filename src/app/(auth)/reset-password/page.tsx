'use client';
import { useActionState } from 'react';
import { updatePassword, type ActionState } from '@/actions/auth';
import { AuthShell } from '@/components/layout/AuthShell';
import { Input } from '@/components/ui/Input';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { FormMessage } from '@/components/ui/FormMessage';

export default function ResetPasswordPage() {
  const [state, action] = useActionState<ActionState, FormData>(updatePassword, {});
  return (
    <AuthShell title="새 비밀번호 설정">
      <form action={action} className="space-y-4">
        <Input label="새 비밀번호" name="password" type="password" autoComplete="new-password" required minLength={8} hint="8자 이상" />
        <Input label="새 비밀번호 확인" name="confirm" type="password" autoComplete="new-password" required />
        <FormMessage error={state.error} />
        <SubmitButton full>비밀번호 변경</SubmitButton>
      </form>
    </AuthShell>
  );
}
