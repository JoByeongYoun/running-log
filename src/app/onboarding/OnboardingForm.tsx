'use client';
import { useActionState, useState } from 'react';
import { completeOnboarding } from '@/actions/profile';
import type { ActionState } from '@/actions/auth';
import { Input } from '@/components/ui/Input';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { FormMessage } from '@/components/ui/FormMessage';
import { AvatarPicker } from '@/components/record/AvatarPicker';

export function OnboardingForm({ userId, returnTo, initialNickname }: { userId: string; returnTo: string; initialNickname: string }) {
  const [state, action] = useActionState<ActionState, FormData>(completeOnboarding, {});
  const [avatarPath, setAvatarPath] = useState('');
  const [nickname, setNickname] = useState(initialNickname);
  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="avatarPath" value={avatarPath} />
      <AvatarPicker userId={userId} initialUrl={null} name={nickname || '?'} onUploaded={setAvatarPath} />
      <Input label="닉네임" name="nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} required minLength={2} maxLength={20} hint="2~20자" autoComplete="nickname" />
      <FormMessage error={state.error} />
      <SubmitButton full disabled={!avatarPath}>시작하기</SubmitButton>
    </form>
  );
}
