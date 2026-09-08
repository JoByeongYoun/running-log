import Link from 'next/link';
import { addWeeks, formatWeekRange } from '@/lib/domain/week';

export function WeekNav({ weekStart, currentWeek, firstWeek }: { weekStart: string; currentWeek: string; firstWeek: string }) {
  const prev = addWeeks(weekStart, -1);
  const next = addWeeks(weekStart, 1);
  const canPrev = prev >= firstWeek;
  const canNext = next <= currentWeek;
  const cls = 'flex min-h-11 min-w-11 items-center justify-center rounded-full text-xl';
  return (
    <nav aria-label="주차 이동" className="flex items-center justify-between">
      {canPrev ? <Link href={`/?week=${prev}`} aria-label="이전 주" className={`${cls} hover:bg-slate-100`}>‹</Link> : <span className={`${cls} text-slate-300`} aria-hidden>‹</span>}
      <div className="text-center">
        <p className="font-semibold">{formatWeekRange(weekStart)}</p>
        {weekStart !== currentWeek && <Link href="/" className="text-xs text-slate-500 underline">이번 주로</Link>}
        {weekStart === currentWeek && <p className="text-xs text-slate-500">이번 주</p>}
      </div>
      {canNext ? <Link href={`/?week=${next}`} aria-label="다음 주" className={`${cls} hover:bg-slate-100`}>›</Link> : <span className={`${cls} text-slate-300`} aria-hidden>›</span>}
    </nav>
  );
}
