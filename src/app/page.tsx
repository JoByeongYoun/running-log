import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/server';
import { getGroupState } from '@/lib/group-state';
import { loadDashboard } from '@/lib/dashboard/load';
import { weekStartOf, mondayOf, isValidYmd } from '@/lib/domain/week';
import { NoGroupHome } from '@/components/group/NoGroupHome';
import { HomeHeader } from '@/components/layout/HomeHeader';
import { WeekNav } from '@/components/dashboard/WeekNav';
import { MyProgress } from '@/components/dashboard/MyProgress';
import { WeekCalendar } from '@/components/dashboard/WeekCalendar';
import { ScrollRestore } from '@/components/dashboard/ScrollRestore';
import { RecordForm } from '@/components/record/RecordForm';
import { SummaryAutoShow } from '@/components/summary/SummaryAutoShow';
import { SummaryButton } from '@/components/summary/SummaryButton';
import { ErrorState } from '@/components/ui/States';
import { messageForError } from '@/lib/errors';

export default async function HomePage({ searchParams }: PageProps<'/'>) {
  const session = await getSessionUser();
  if (!session) redirect('/login');
  const supabase = session.supabase;
  const [state, { data: unread }] = await Promise.all([getGroupState(supabase), supabase.rpc('get_unread_count')]);

  if (!state.membership) {
    return (
      <>
        <HomeHeader title="Running Log" admin={false} unread={unread ?? 0} pendingAdmin={0} />
        <main className="mx-auto w-full max-w-md px-4 py-6"><NoGroupHome state={state} /></main>
      </>
    );
  }

  const groupId = state.membership.groupId;
  const isAdmin = state.membership.role === 'admin';
  const currentWeek = weekStartOf(new Date());
  const sp = await searchParams;
  const rawWeek = typeof sp.week === 'string' ? sp.week : null;
  if (rawWeek) {
    if (!isValidYmd(rawWeek)) redirect('/');
    const normalized = mondayOf(rawWeek);
    if (normalized > currentWeek) redirect('/');
    if (normalized !== rawWeek) redirect(`/?week=${normalized}`);
  }
  const weekStart = rawWeek ?? currentWeek;

  const [{ data: weeks }, dash, pendingAdmin] = await Promise.all([
    supabase.rpc('get_available_weeks', { p_group_id: groupId }),
    loadDashboard(supabase, groupId, weekStart),
    isAdmin ? countAdminPending(supabase, groupId) : Promise.resolve(0),
  ]);
  const firstWeek = weeks?.[0] ?? currentWeek;
  if (dash.error?.includes('before_group_created')) redirect('/');

  return (
    <>
      <HomeHeader title={state.membership.groupName} admin={isAdmin} unread={unread ?? 0} pendingAdmin={pendingAdmin} />
      <main className="mx-auto w-full max-w-md space-y-4 px-4 py-4">
        <ScrollRestore storageKey={`scroll:/?week=${weekStart}`} />
        <SummaryAutoShow />
        <div className="flex items-center justify-between">
          <WeekNav weekStart={weekStart} currentWeek={currentWeek} firstWeek={firstWeek} />
        </div>
        {dash.error || !dash.data ? (
          <ErrorState description={messageForError(dash.error)} action={<Link href="/" className="underline">이번 주로</Link>} />
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              {dash.data.week.state === 'finalized' ? (
                <span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs text-white">확정</span>
              ) : dash.data.week.state === 'closing' ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">집계 중 · 월요일 12:00까지 검토</span>
              ) : (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">진행 중</span>
              )}
              <div className="flex gap-2">
                {!dash.data.week.isCurrent && <SummaryButton groupId={groupId} weekStart={weekStart} />}
              </div>
            </div>
            <MyProgress data={dash.data} />
            <WeekCalendar data={dash.data} myId={session.user.id} />
            {dash.data.week.isCurrent && (
              <section id="today" className="scroll-mt-16 rounded-2xl border border-slate-200 p-4">
                <h2 className="mb-3 font-semibold">오늘의 기록 등록</h2>
                <RecordForm today={dash.data.today} disabledReason={state.membership.archived ? '보관된 그룹에는 기록을 등록할 수 없습니다.' : undefined} />
              </section>
            )}
          </>
        )}
      </main>
    </>
  );
}

async function countAdminPending(supabase: Awaited<ReturnType<typeof getSessionUser>> extends infer S ? (S extends { supabase: infer C } ? C : never) : never, groupId: string): Promise<number> {
  const [{ count: a }, { count: b }] = await Promise.all([
    supabase.from('join_requests').select('id', { count: 'exact', head: true }).eq('group_id', groupId).eq('status', 'pending'),
    supabase.from('running_records').select('id', { count: 'exact', head: true }).eq('group_id', groupId).eq('status', 'pending'),
  ]);
  return (a ?? 0) + (b ?? 0);
}
