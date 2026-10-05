import { redirect } from 'next/navigation';
import { loadTabShell } from '@/lib/dashboard/shell';
import { signedUrls } from '@/lib/storage/signed-url';
import { weekStartOf } from '@/lib/domain/week';
import { formatMeters } from '@/lib/domain/distance';
import { HomeHeader } from '@/components/layout/HomeHeader';
import { BottomNav } from '@/components/layout/BottomNav';
import { Avatar } from '@/components/ui/Avatar';
import { RulesLine } from '@/components/group/RulesLine';

export default async function GroupPage() {
  const { supabase, state, isAdmin, unread, pendingAdmin } = await loadTabShell();
  if (!state.membership) redirect('/');
  const { groupId, groupName, notice, archived } = state.membership;
  const thisWeek = weekStartOf(new Date());

  const [{ data: settings }, { data: members }] = await Promise.all([
    supabase.from('group_settings').select('effective_week_start, target_meters, penalty, free_min_meters, penalty_per_km_won, zero_km_penalty_won').eq('group_id', groupId).order('effective_week_start', { ascending: false }),
    supabase.from('memberships').select('user_id, role, joined_at, runner_type, profiles(nickname, avatar_path)').eq('group_id', groupId).is('left_at', null).order('joined_at'),
  ]);
  const current = (settings ?? []).find((s) => s.effective_week_start <= thisWeek) ?? settings?.[settings.length - 1] ?? null;
  const scheduled = (settings ?? []).find((s) => s.effective_week_start > thisWeek) ?? null;
  const urls = await signedUrls('avatars', (members ?? []).map((m) => m.profiles?.avatar_path).filter((p): p is string => Boolean(p)));

  return (
    <>
      <HomeHeader title={groupName} admin={isAdmin} unread={unread} pendingAdmin={pendingAdmin} />
      <main className="mx-auto w-full max-w-md space-y-4 px-4 py-4 pb-24">
        <section className="rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold">{groupName}</h2>
            {archived && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-700">보관됨</span>}
          </div>
          {current && (
            <div className="mt-3 space-y-2">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">열정러너 주간 목표</p>
                <p className="mt-0.5 text-xl font-bold tabular-nums">{formatMeters(current.target_meters)} <span className="text-sm font-normal text-slate-500">km</span></p>
              </div>
              <RulesLine className="rounded-xl bg-slate-50 p-3" rules={{ targetMeters: current.target_meters, freeMinMeters: current.free_min_meters, penaltyPerKmWon: current.penalty_per_km_won, zeroKmPenaltyWon: current.zero_km_penalty_won, penalty: current.penalty }} />
            </div>
          )}
          {scheduled && (
            <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <p className="font-semibold">{scheduled.effective_week_start}부터 적용 예정</p>
              <RulesLine className="text-amber-900" rules={{ targetMeters: scheduled.target_meters, freeMinMeters: scheduled.free_min_meters, penaltyPerKmWon: scheduled.penalty_per_km_won, zeroKmPenaltyWon: scheduled.zero_km_penalty_won, penalty: scheduled.penalty }} />
            </div>
          )}
        </section>

        {notice && (
          <section className="rounded-2xl border border-slate-200 p-4">
            <h3 className="mb-2 font-semibold">공지사항</h3>
            <p className="whitespace-pre-wrap text-sm text-slate-700">{notice}</p>
          </section>
        )}

        <section className="rounded-2xl border border-slate-200 p-4">
          <h3 className="mb-2 font-semibold">멤버 {members?.length ?? 0}명</h3>
          <ul className="divide-y divide-slate-200">
            {(members ?? []).map((m) => {
              const nickname = m.profiles?.nickname ?? '(이름 없음)';
              return (
                <li key={m.user_id} className="flex items-center gap-3 py-3">
                  <Avatar src={m.profiles?.avatar_path ? urls.get(m.profiles.avatar_path) ?? null : null} name={nickname} badge={m.runner_type} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {nickname}
                      {m.role === 'admin' && <span className="ml-1 rounded-full bg-slate-900 px-2 py-0.5 text-xs text-white">관리자</span>}
                    </p>
                    <p className="text-xs text-slate-500">참여 {new Date(m.joined_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </main>
      <BottomNav />
    </>
  );
}
