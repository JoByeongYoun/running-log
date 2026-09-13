import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/server';
import { AppHeader } from '@/components/layout/AppHeader';
import { EmptyState } from '@/components/ui/States';
import { MarkReadOnView } from './MarkReadOnView';
import { notificationText, type NotificationView } from '@/lib/notification-text';

export default async function NotificationsPage() {
  const session = await getSessionUser();
  if (!session) redirect('/login');
  const { data } = await session.supabase.rpc('get_notifications', { p_limit: 100 });
  const items = (data ?? []) as unknown as NotificationView[];
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
                  <p className="text-sm">{!n.readAt && <span className="mr-1 inline-block h-2 w-2 rounded-full bg-red-500" aria-label="안 읽음" />}{notificationText(n)}</p>
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
