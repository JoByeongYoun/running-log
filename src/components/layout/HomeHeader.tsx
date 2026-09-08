import Link from 'next/link';
import { AppHeader } from './AppHeader';

export function HomeHeader({ title, admin, unread, pendingAdmin }: { title: string; admin: boolean; unread: number; pendingAdmin: number }) {
  return (
    <AppHeader
      title={title}
      right={
        <div className="flex items-center gap-1">
          {admin && (
            <Link href="/admin" className="relative flex min-h-11 items-center rounded-full px-3 text-sm font-medium hover:bg-slate-100">
              관리{pendingAdmin > 0 && <span className="ml-1 rounded-full bg-red-600 px-1.5 text-xs text-white">{pendingAdmin}</span>}
            </Link>
          )}
          <Link href="/notifications" aria-label={`알림${unread ? ` ${unread}개 안 읽음` : ''}`} className="relative flex min-h-11 min-w-11 items-center justify-center rounded-full hover:bg-slate-100">
            🔔{unread > 0 && <span className="absolute right-1 top-1 rounded-full bg-red-600 px-1.5 text-[10px] text-white">{unread > 99 ? '99+' : unread}</span>}
          </Link>
          <Link href="/profile" aria-label="프로필" className="flex min-h-11 min-w-11 items-center justify-center rounded-full hover:bg-slate-100">👤</Link>
        </div>
      }
    />
  );
}
