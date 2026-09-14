'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/group', label: '그룹', icon: GroupIcon },
  { href: '/', label: '주간 진행도', icon: TrackIcon },
  { href: '/record', label: '기록 올리기', icon: PlusIcon },
] as const;

function GroupIcon() {
  return (
    <svg aria-hidden width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M16 14.5c3 0 5.5 1.9 5.5 4.5" />
    </svg>
  );
}
function TrackIcon() {
  return (
    <svg aria-hidden width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6" width="18" height="12" rx="6" />
      <rect x="7.5" y="10" width="9" height="4" rx="2" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg aria-hidden width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

/** 하단 탭: 그룹 · 주간 진행도(기본, 가운데) · 기록 올리기 */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="주요 메뉴" className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur-md" style={{ paddingBottom: 'var(--safe-bottom)' }}>
      <ul className="mx-auto flex w-full max-w-md">
        {TABS.map((t) => {
          const active = pathname === t.href;
          const Icon = t.icon;
          return (
            <li key={t.href} className="flex-1">
              <Link href={t.href} aria-current={active ? 'page' : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition active:scale-95 ${active ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>
                <Icon />
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
