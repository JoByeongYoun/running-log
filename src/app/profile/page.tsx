import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/server';
import { signedUrl } from '@/lib/storage/signed-url';
import { ProfileForm } from './ProfileForm';
import { AppHeader } from '@/components/layout/AppHeader';
import { PushSection } from './PushSection';
import { LeaveGroupSection } from './LeaveGroupSection';
import { RestSection } from './RestSection';
import { getGroupState } from '@/lib/group-state';

export default async function ProfilePage() {
  const session = await getSessionUser();
  if (!session || !session.profile) redirect('/login');
  const avatarUrl = await signedUrl('avatars', session.profile.avatar_path);
  // 내 멤버십은 get_my_group_state 로 읽는다. (memberships 를 직접 조회하면 RLS 상 같은 그룹 전원이 보여 maybeSingle 이 실패한다)
  const state = await getGroupState(session.supabase);
  const membership = state.membership;
  const { count: otherMembers } = membership
    ? await session.supabase.from('memberships').select('id', { count: 'exact', head: true }).eq('group_id', membership.groupId).is('left_at', null).neq('user_id', session.user.id)
    : { count: 0 };
  return (
    <>
      <AppHeader title="프로필" back="/" />
      <main className="mx-auto w-full max-w-md space-y-8 px-5 py-6">
        <ProfileForm userId={session.user.id} nickname={session.profile.nickname ?? ''} avatarUrl={avatarUrl} />
        <PushSection />
        <RestSection
          groupName={membership?.groupName ?? null}
          resting={membership?.resting ?? false}
          restStartedAt={membership?.restStartedAt ?? null}
          pendingRequest={state.pendingRestRequest}
        />
        <LeaveGroupSection
          groupName={membership?.groupName ?? null}
          isAdmin={membership?.role === 'admin'}
          hasOtherMembers={(otherMembers ?? 0) > 0}
        />
      </main>
    </>
  );
}
