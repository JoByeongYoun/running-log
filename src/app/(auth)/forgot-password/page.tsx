'use client';
import { useActionState } from 'react';
import Link from 'next/link';
import { requestPasswordReset, type ActionState } from '@/actions/auth';
import { AuthShell } from '@/components/layout/AuthShell';
import { Input } from '@/components/ui/Input';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { FormMessage } from '@/components/ui/FormMessage';

export default function ForgotPasswordPage() {
  const [state, action] = useActionState<ActionState, FormData>(requestPasswordReset, {});
  return (
    <AuthShell title="비밀번호 재설정">
      <form action={action} className="space-y-4">
        <Input label="가입한 이메일" name="email" type="email" autoComplete="email" required />
        <FormMessage error={state.error} success={state.success} />
        <SubmitButton full>재설정 링크 보내기</SubmitButton>
      </form>
      <p className="mt-6 text-center text-sm"><Link href="/login" className="underline">로그인으로 돌아가기</Link></p>
    </AuthShell>
  );
}
