'use client';
import { useActionState } from 'react';
import { signIn, type ActionState } from '@/actions/auth';
import { Input } from '@/components/ui/Input';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { FormMessage } from '@/components/ui/FormMessage';

export function LoginForm({ returnTo }: { returnTo: string }) {
  const [state, action] = useActionState<ActionState, FormData>(signIn, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="returnTo" value={returnTo} />
      <Input label="이메일" name="email" type="email" autoComplete="email" required inputMode="email" />
      <Input label="비밀번호" name="password" type="password" autoComplete="current-password" required />
      <FormMessage error={state.error} />
      <SubmitButton full>로그인</SubmitButton>
    </form>
  );
}
