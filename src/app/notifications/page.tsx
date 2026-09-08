import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/server';
import { AppHeader } from '@/components/layout/AppHeader';
import { EmptyState } from '@/components/ui/States';
import { MarkReadOnView } from './MarkReadOnView';
import { formatMeters } from '@/lib/domain/distance';
import { formatWeekRange } from '@/lib/domain/week';

type Item = { id: string; type: string; link: string | null; readAt: string | null; createdAt: string; meta: Record<string, string | number | null> };

function text(n: Item): string {
  const m = n.meta ?? {};
  switch (n.type) {
    case 'join_request': return `${m.nickname ?? '회원'}님이 참여를 요청했습니다.`;
    case 'join_result': return m.status === 'approved' ? `${m.groupName} 참여가 승인되었습니다.` : m.status === 'rejected' ? `${m.groupName} 참여 요청이 거절되었습니다.` : `${m.groupName} 참여 요청이 처리되었습니다.`;
    case 'record_submitted': return `${m.nickname ?? '회원'}님이 ${m.meters ? formatMeters(Number(m.meters)) + 'km ' : ''}기록을 제출했습니다.`;
    case 'record_review': {
      const s = m.status === 'approved' ? '승인되었습니다' : m.status === 'rejected' ? `반려되었습니다${m.reason ? ` (${m.reason})` : ''}` : m.status === 'pending' ? `승인이 취소되었습니다${m.reason ? ` (${m.reason})` : ''}` : '처리되었습니다';
      return `${m.meters ? formatMeters(Number(m.meters)) + 'km ' : ''}기록이 ${s}.`;
    }
    case 'record_expired': return `${m.date ?? ''} ${m.meters ? formatMeters(Number(m.meters)) + 'km ' : ''}기록이 검토 기한 만료로 합계에서 제외되었습니다.`;
    case 'review_reminder': return m.phase === '11' ? '지난주 기록 검토 마감이 1시간 남았습니다 (12:00).' : '지난주 검토가 남아 있습니다. 월요일 12:00까지 처리하세요.';
    case 'week_final': return `${m.weekStart ? formatWeekRange(String(m.weekStart)) + ' ' : ''}주간 결과가 확정되었습니다.`;
    default: return '알림';
  }
}

export default async function NotificationsPage() {
  const session = await getSessionUser();
  if (!session) redirect('/login');
  const { data } = await session.supabase.rpc('get_notifications', { p_limit: 100 });
  const items = (data ?? []) as unknown as Item[];
  const unreadIds = items.filter((n) => !n.readAt).map((n) => n.id);
  return (
    <>
      <AppHeader title="알림" back="/" />
      <main className="mx-auto w-full max-w-md px-4 py-4">
        <MarkReadOnView ids={unreadIds} />
        {items.length === 0 ? <EmptyState title="알림이 없습니다" /> : (
          <ul className="divide-y divide-slate-200">
            {items.map((n) => {
              const body = (
                <div className={`py-3 ${n.readAt ? 'text-slate-500' : 'text-slate-900'}`}>
                  <p className="text-sm">{!n.readAt && <span className="mr-1 inline-block h-2 w-2 rounded-full bg-red-500" aria-label="안 읽음" />}{text(n)}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{new Date(n.createdAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</p>
                </div>
              );
              return <li key={n.id}>{n.link ? <Link href={n.link} className="block hover:bg-slate-50">{body}</Link> : body}</li>;
            })}
          </ul>
        )}
      </main>
    </>
  );
}
