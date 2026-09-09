import Link from 'next/link';
import { AppHeader } from './AppHeader';

const iconBtn = 'relative flex min-h-11 min-w-11 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100 active:scale-95';

function BellIcon() {
  return (
    <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-3.5 3.6-6 8-6s8 2.5 8 6" />
    </svg>
  );
}

export function HomeHeader({ title, admin, unread, pendingAdmin }: { title: string; admin: boolean; unread: number; pendingAdmin: number }) {
  return (
    <AppHeader
      title={title}
      brand
      right={
        <div className="flex items-center gap-0.5">
          {admin && (
            <Link href="/admin" className="relative flex min-h-11 items-center rounded-full px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100 active:scale-95">
              관리{pendingAdmin > 0 && <span className="ml-1 rounded-full bg-red-600 px-1.5 text-xs text-white">{pendingAdmin}</span>}
            </Link>
          )}
          <Link href="/notifications" aria-label={`알림${unread ? ` ${unread}개 안 읽음` : ''}`} className={iconBtn}>
            <BellIcon />
            {unread > 0 && <span className="absolute right-1 top-1 rounded-full bg-red-600 px-1.5 text-[10px] font-semibold leading-4 text-white">{unread > 99 ? '99+' : unread}</span>}
          </Link>
          <Link href="/profile" aria-label="프로필" className={iconBtn}><UserIcon /></Link>
        </div>
      }
    />
  );
}
