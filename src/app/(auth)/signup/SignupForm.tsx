'use client';
import { useActionState } from 'react';
import { signUp, type ActionState } from '@/actions/auth';
import { Input } from '@/components/ui/Input';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { FormMessage } from '@/components/ui/FormMessage';

export function SignupForm({ returnTo }: { returnTo: string }) {
  const [state, action] = useActionState<ActionState, FormData>(signUp, {});
  if (state.success) return <FormMessage success={state.success} />;
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="returnTo" value={returnTo} />
      <Input label="이메일" name="email" type="email" autoComplete="email" required inputMode="email" />
      <Input label="비밀번호" name="password" type="password" autoComplete="new-password" required minLength={8} hint="8자 이상" />
      <FormMessage error={state.error} />
      <SubmitButton full>가입하기</SubmitButton>
    </form>
  );
}
