import { redirect } from 'next/navigation';
import { loadTabShell } from '@/lib/dashboard/shell';
import { signedUrls } from '@/lib/storage/signed-url';
import { weekStartOf } from '@/lib/domain/week';
import { formatMeters } from '@/lib/domain/distance';
import { HomeHeader } from '@/components/layout/HomeHeader';
import { BottomNav } from '@/components/layout/BottomNav';
import { Avatar } from '@/components/ui/Avatar';

export default async function GroupPage() {
  const { supabase, state, isAdmin, unread, pendingAdmin } = await loadTabShell();
  if (!state.membership) redirect('/');
  const { groupId, groupName, notice, archived } = state.membership;
  const thisWeek = weekStartOf(new Date());

  const [{ data: settings }, { data: members }] = await Promise.all([
    supabase.from('group_settings').select('effective_week_start, target_meters, penalty').eq('group_id', groupId).order('effective_week_start', { ascending: false }),
    supabase.from('memberships').select('user_id, role, joined_at, profiles(nickname, avatar_path)').eq('group_id', groupId).is('left_at', null).order('joined_at'),
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
            <dl className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">주간 목표</dt>
                <dd className="mt-0.5 text-xl font-bold tabular-nums">{formatMeters(current.target_meters)} <span className="text-sm font-normal text-slate-500">km</span></dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">벌칙</dt>
                <dd className="mt-0.5 break-words text-sm font-semibold">{current.penalty}</dd>
              </div>
            </dl>
          )}
          {scheduled && (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {scheduled.effective_week_start}부터 목표 {formatMeters(scheduled.target_meters)} km, 벌칙 “{scheduled.penalty}” 적용 예정
            </p>
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
                  <Avatar src={m.profiles?.avatar_path ? urls.get(m.profiles.avatar_path) ?? null : null} name={nickname} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{nickname} {m.role === 'admin' && <span className="ml-1 rounded-full bg-slate-900 px-2 py-0.5 text-xs text-white">관리자</span>}</p>
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
