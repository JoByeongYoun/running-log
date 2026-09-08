import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/server';
import { signedUrl } from '@/lib/storage/signed-url';
import { ProfileForm } from './ProfileForm';
import { AppHeader } from '@/components/layout/AppHeader';
import { LeaveGroupSection } from './LeaveGroupSection';

export default async function ProfilePage() {
  const session = await getSessionUser();
  if (!session || !session.profile) redirect('/login');
  const avatarUrl = await signedUrl('avatars', session.profile.avatar_path);
  const { data: membership } = await session.supabase
    .from('memberships').select('group_id, role, groups(name)').is('left_at', null).maybeSingle();
  const { count: otherMembers } = membership
    ? await session.supabase.from('memberships').select('id', { count: 'exact', head: true }).eq('group_id', membership.group_id).is('left_at', null).neq('user_id', session.user.id)
    : { count: 0 };
  return (
    <>
      <AppHeader title="프로필" back="/" />
      <main className="mx-auto w-full max-w-md space-y-8 px-5 py-6">
        <ProfileForm userId={session.user.id} nickname={session.profile.nickname ?? ''} avatarUrl={avatarUrl} />
        <LeaveGroupSection
          groupName={membership?.groups?.name ?? null}
          isAdmin={membership?.role === 'admin'}
          hasOtherMembers={(otherMembers ?? 0) > 0}
        />
      </main>
    </>
  );
}
