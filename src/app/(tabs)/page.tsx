import Link from 'next/link';
import { redirect } from 'next/navigation';
import { loadTabShell } from '@/lib/dashboard/shell';
import { loadDashboard } from '@/lib/dashboard/load';
import { weekStartOf, mondayOf, isValidYmd } from '@/lib/domain/week';
import { NoGroupHome } from '@/components/group/NoGroupHome';
import { HomeHeader } from '@/components/layout/HomeHeader';
import { BottomNav } from '@/components/layout/BottomNav';
import { WeekNav } from '@/components/dashboard/WeekNav';
import { MyProgress } from '@/components/dashboard/MyProgress';
import { WeekTrack } from '@/components/dashboard/WeekTrack';
import { ScrollRestore } from '@/components/dashboard/ScrollRestore';
import { SummaryAutoShow } from '@/components/summary/SummaryAutoShow';
import { SummaryButton } from '@/components/summary/SummaryButton';
import { PushBanner } from '@/components/pwa/PushBanner';
import { RejectedBanner } from '@/components/dashboard/RejectedBanner';
import { ErrorState } from '@/components/ui/States';
import { messageForError } from '@/lib/errors';

export default async function HomePage({ searchParams }: PageProps<'/'>) {
  const { session, supabase, state, isAdmin, unread, pendingAdmin } = await loadTabShell();

  if (!state.membership) {
    return (
      <>
        <HomeHeader title="Running Log" admin={false} unread={unread} pendingAdmin={0} />
        <main className="mx-auto w-full max-w-md px-4 py-6"><NoGroupHome state={state} /></main>
      </>
    );
  }

  const groupId = state.membership.groupId;
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

  const [{ data: weeks }, dash] = await Promise.all([
    supabase.rpc('get_available_weeks', { p_group_id: groupId }),
    loadDashboard(supabase, groupId, weekStart),
  ]);
  const firstWeek = weeks?.[0] ?? currentWeek;
  if (dash.error?.includes('before_group_created')) redirect('/');

  return (
    <>
      <HomeHeader title={state.membership.groupName} admin={isAdmin} unread={unread} pendingAdmin={pendingAdmin} />
      <main className="mx-auto w-full max-w-md space-y-4 px-4 py-4 pb-24">
        <ScrollRestore storageKey={`scroll:/?week=${weekStart}`} />
        <SummaryAutoShow />
        <PushBanner />
        <WeekNav weekStart={weekStart} currentWeek={currentWeek} firstWeek={firstWeek} />
        {dash.error || !dash.data ? (
          <ErrorState description={messageForError(dash.error)} action={<Link href="/" className="underline">이번 주로</Link>} />
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              {dash.data.week.state === 'finalized' ? (
                <span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs text-white">확정</span>
              ) : dash.data.week.state === 'closing' ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">집계 중 · 화요일 12:00까지 검토</span>
              ) : (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">진행 중</span>
              )}
              {!dash.data.week.isCurrent && <SummaryButton groupId={groupId} weekStart={weekStart} />}
            </div>
            <RejectedBanner data={dash.data} myId={session.user.id} />
            <MyProgress data={dash.data} />
            <WeekTrack data={dash.data} myId={session.user.id} />
          </>
        )}
      </main>
      <BottomNav />
    </>
  );
}
