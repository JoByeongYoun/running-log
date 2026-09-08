import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/server';
import { getGroupState } from '@/lib/group-state';
import { AppHeader } from '@/components/layout/AppHeader';
import { NewGroupForm } from './NewGroupForm';

export default async function NewGroupPage() {
  const session = await getSessionUser();
  if (!session) redirect('/login');
  const state = await getGroupState(session.supabase);
  if (state.membership) redirect('/');
  return (
    <>
      <AppHeader title="그룹 만들기" back="/" />
      <main className="mx-auto w-full max-w-md px-5 py-6">
        {state.pendingRequest && <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">대기 중인 참여 요청을 취소해야 그룹을 만들 수 있습니다.</p>}
        <NewGroupForm disabled={Boolean(state.pendingRequest)} />
      </main>
    </>
  );
}
