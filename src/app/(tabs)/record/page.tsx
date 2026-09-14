import { redirect } from 'next/navigation';
import { loadTabShell } from '@/lib/dashboard/shell';
import { kstDateOf } from '@/lib/domain/week';
import { HomeHeader } from '@/components/layout/HomeHeader';
import { BottomNav } from '@/components/layout/BottomNav';
import { RecordForm } from '@/components/record/RecordForm';

export default async function RecordPage() {
  const { state, isAdmin, unread, pendingAdmin } = await loadTabShell();
  if (!state.membership) redirect('/');
  const today = kstDateOf(new Date());
  return (
    <>
      <HomeHeader title={state.membership.groupName} admin={isAdmin} unread={unread} pendingAdmin={pendingAdmin} />
      <main className="mx-auto w-full max-w-md px-4 py-4 pb-24">
        <section className="rounded-2xl border border-slate-200 p-4">
          <h2 className="mb-3 font-semibold">오늘의 기록 등록</h2>
          <RecordForm today={today} notice={state.membership.notice} disabledReason={state.membership.archived ? '보관된 그룹에는 기록을 등록할 수 없습니다.' : undefined} />
        </section>
      </main>
      <BottomNav />
    </>
  );
}
