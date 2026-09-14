import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/server';
import { getGroupState } from '@/lib/group-state';

type Session = NonNullable<Awaited<ReturnType<typeof getSessionUser>>>;
type Client = Session['supabase'];

/** 하단 탭 페이지 공통: 로그인·그룹 상태·헤더 뱃지 개수 */
export async function loadTabShell() {
  const session = await getSessionUser();
  if (!session) redirect('/login');
  const supabase = session.supabase;
  const [state, { data: unread }] = await Promise.all([getGroupState(supabase), supabase.rpc('get_unread_count')]);
  const isAdmin = state.membership?.role === 'admin';
  const pendingAdmin = isAdmin && state.membership ? await countAdminPending(supabase, state.membership.groupId) : 0;
  return { session, supabase, state, isAdmin, unread: unread ?? 0, pendingAdmin };
}

async function countAdminPending(supabase: Client, groupId: string): Promise<number> {
  const [{ count: a }, { count: b }] = await Promise.all([
    supabase.from('join_requests').select('id', { count: 'exact', head: true }).eq('group_id', groupId).eq('status', 'pending'),
    supabase.from('running_records').select('id', { count: 'exact', head: true }).eq('group_id', groupId).eq('status', 'pending'),
  ]);
  return (a ?? 0) + (b ?? 0);
}
