import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/server';
import { getGroupState } from '@/lib/group-state';
import { signedUrls } from '@/lib/storage/signed-url';
import { weekStartOf } from '@/lib/domain/week';
import { AppHeader } from '@/components/layout/AppHeader';
import { JoinRequests, type JoinRequestItem } from '@/components/admin/JoinRequests';
import { MemberList, type MemberItem } from '@/components/admin/MemberList';
import { GroupSettings } from '@/components/admin/GroupSettings';
import { ReviewQueue } from '@/components/admin/ReviewQueue';

const TABS = [
  { key: 'requests', label: '참여 요청' },
  { key: 'reviews', label: '기록 검토' },
  { key: 'members', label: '멤버' },
  { key: 'settings', label: '그룹 설정' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export default async function AdminPage({ searchParams }: PageProps<'/admin'>) {
  const session = await getSessionUser();
  if (!session) redirect('/login');
  const state = await getGroupState(session.supabase);
  if (!state.membership || state.membership.role !== 'admin') redirect('/');
  const sp = await searchParams;
  const tab = (TABS.some((t) => t.key === sp.tab) ? sp.tab : 'requests') as TabKey;
  const invite = typeof sp.invite === 'string' && sp.invite ? sp.invite : null;
  const groupId = state.membership.groupId;
  const supabase = session.supabase;

  const [{ data: requests }, { data: members }, { count: pendingRecords }] = await Promise.all([
    supabase.from('join_requests').select('id, user_id, created_at, profiles!join_requests_user_id_fkey(nickname, avatar_path)').eq('group_id', groupId).eq('status', 'pending').order('created_at'),
    supabase.from('memberships').select('user_id, role, joined_at, profiles(nickname, avatar_path)').eq('group_id', groupId).is('left_at', null).order('joined_at'),
    supabase.from('running_records').select('id', { count: 'exact', head: true }).eq('group_id', groupId).eq('status', 'pending'),
  ]);
  const avatarPaths = [...(requests ?? []).map((r) => r.profiles?.avatar_path), ...(members ?? []).map((m) => m.profiles?.avatar_path)].filter((p): p is string => Boolean(p));
  const urls = await signedUrls('avatars', avatarPaths);

  const requestItems: JoinRequestItem[] = (requests ?? []).map((r) => ({
    id: r.id, userId: r.user_id, nickname: r.profiles?.nickname ?? '(이름 없음)',
    avatarUrl: r.profiles?.avatar_path ? urls.get(r.profiles.avatar_path) ?? null : null, createdAt: r.created_at,
  }));
  const memberItems: MemberItem[] = (members ?? []).map((m) => ({
    userId: m.user_id, role: m.role, joinedAt: m.joined_at, nickname: m.profiles?.nickname ?? '(이름 없음)',
    avatarUrl: m.profiles?.avatar_path ? urls.get(m.profiles.avatar_path) ?? null : null,
  }));

  const counts: Partial<Record<TabKey, number>> = { requests: requestItems.length, reviews: pendingRecords ?? 0 };

  return (
    <>
      <AppHeader title="관리자" back="/" />
      <nav className="sticky top-14 z-20 border-b border-slate-200 bg-white">
        <ul className="mx-auto flex w-full max-w-md">
          {TABS.map((t) => (
            <li key={t.key} className="flex-1">
              <Link href={`/admin?tab=${t.key}`} aria-current={tab === t.key ? 'page' : undefined}
                className={`flex min-h-11 items-center justify-center gap-1 text-sm ${tab === t.key ? 'border-b-2 border-slate-900 font-semibold' : 'text-slate-500'}`}>
                {t.label}{counts[t.key] ? <span className="rounded-full bg-red-600 px-1.5 text-xs text-white">{counts[t.key]}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <main className="mx-auto w-full max-w-md px-4 py-4">
        {tab === 'requests' && <JoinRequests items={requestItems} />}
        {tab === 'reviews' && <ReviewQueue groupId={groupId} />}
        {tab === 'members' && (
          <MemberList groupId={groupId} members={memberItems} myId={session.user.id} initialInvite={invite} siteUrl={process.env.NEXT_PUBLIC_SITE_URL ?? ''} />
        )}
        {tab === 'settings' && <SettingsTab groupId={groupId} name={state.membership.groupName} />}
      </main>
    </>
  );
}

async function SettingsTab({ groupId, name }: { groupId: string; name: string }) {
  const session = await getSessionUser();
  const thisWeek = weekStartOf(new Date());
  const { data: settings } = await session!.supabase.from('group_settings').select('effective_week_start, target_meters, penalty').eq('group_id', groupId).order('effective_week_start', { ascending: false });
  const current = (settings ?? []).find((s) => s.effective_week_start <= thisWeek) ?? settings?.[settings.length - 1];
  const scheduled = (settings ?? []).find((s) => s.effective_week_start > thisWeek) ?? null;
  if (!current) return null;
  return (
    <GroupSettings
      groupId={groupId} name={name}
      current={{ targetMeters: current.target_meters, penalty: current.penalty, weekStart: current.effective_week_start }}
      scheduled={scheduled ? { targetMeters: scheduled.target_meters, penalty: scheduled.penalty, weekStart: scheduled.effective_week_start } : null}
    />
  );
}
