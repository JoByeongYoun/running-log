'use client';
import { useActionState, useState } from 'react';
import { updateProfile } from '@/actions/profile';
import { signOut } from '@/actions/auth';
import type { ActionState } from '@/actions/auth';
import { Input } from '@/components/ui/Input';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { FormMessage } from '@/components/ui/FormMessage';
import { AvatarPicker } from '@/components/record/AvatarPicker';
import { Button } from '@/components/ui/Button';

export function ProfileForm({ userId, nickname: initial, avatarUrl }: { userId: string; nickname: string; avatarUrl: string | null }) {
  const [state, action] = useActionState<ActionState, FormData>(updateProfile, {});
  const [avatarPath, setAvatarPath] = useState('');
  const [nickname, setNickname] = useState(initial);
  return (
    <div className="space-y-6">
      <form action={action} className="space-y-5">
        <input type="hidden" name="avatarPath" value={avatarPath} />
        <AvatarPicker userId={userId} initialUrl={avatarUrl} name={nickname} onUploaded={setAvatarPath} />
        <Input label="닉네임" name="nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} required minLength={2} maxLength={20} hint="2~20자" />
        <FormMessage error={state.error} success={state.success} />
        <SubmitButton full>저장</SubmitButton>
      </form>
      <form action={signOut}>
        <Button type="submit" variant="secondary" full>로그아웃</Button>
      </form>
    </div>
  );
}
