'use client';
import { useActionState, useState, useTransition } from 'react';
import { updateProfile } from '@/actions/profile';
import { signOut } from '@/actions/auth';
import { deletePushSubscription } from '@/actions/push';
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
  const [signingOut, startSignOut] = useTransition();

  const handleSignOut = () => {
    startSignOut(async () => {
      // 이 기기의 구독은 서버에서만 지운다(브라우저 구독은 남겨서 다음 사용자가 다시 켤 수 있게 한다).
      try {
        if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
          const reg = await navigator.serviceWorker.ready;
          const sub = await reg.pushManager.getSubscription();
          if (sub) await deletePushSubscription(sub.endpoint).catch(() => {});
        }
      } catch {
        // 구독 정리 실패는 무시하고 로그아웃은 계속 진행한다.
      }
      await signOut();
    });
  };

  return (
    <div className="space-y-6">
      <form action={action} className="space-y-5">
        <input type="hidden" name="avatarPath" value={avatarPath} />
        <AvatarPicker userId={userId} initialUrl={avatarUrl} name={nickname} onUploaded={setAvatarPath} />
        <Input label="닉네임" name="nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} required minLength={2} maxLength={20} hint="2~20자" />
        <FormMessage error={state.error} success={state.success} />
        <SubmitButton full>저장</SubmitButton>
      </form>
      <form onSubmit={(e) => { e.preventDefault(); handleSignOut(); }}>
        <Button type="submit" variant="secondary" full loading={signingOut}>로그아웃</Button>
      </form>
    </div>
  );
}
