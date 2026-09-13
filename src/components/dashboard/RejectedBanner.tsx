import Link from 'next/link';
import { formatMeters } from '@/lib/domain/distance';
import { isEditWindowOpen } from '@/lib/domain/week';
import type { WeekDashboard } from '@/lib/dashboard/types';

/** 내 반려 기록이 있고 아직 재제출할 수 있으면 홈 상단에 안내한다. */
export function RejectedBanner({ data, myId }: { data: WeekDashboard; myId: string }) {
  if (!isEditWindowOpen(data.week.weekStart, data.week.state)) return null;
  const me = data.members.find((m) => m.userId === myId);
  if (!me) return null;
  const rejected = me.days.flatMap((d) => d.records.filter((r) => r.status === 'rejected').map((r) => ({ ...r, date: d.date })));
  if (rejected.length === 0) return null;
  const back = `?week=${data.week.weekStart}&from=home`;
  return (
    <section role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-3">
      <p className="text-sm font-semibold text-red-700">반려된 기록 {rejected.length}건</p>
      <p className="mt-0.5 text-xs text-red-600">사진이나 내용을 보강한 뒤 재제출하면 관리자가 다시 검토합니다. {data.week.state === 'closing' ? '화요일 12:00까지 가능합니다.' : ''}</p>
      <ul className="mt-2 space-y-1">
        {rejected.map((r) => (
          <li key={r.id}>
            <Link href={`/records/${r.id}${back}`} className="flex min-h-10 items-center justify-between rounded-xl bg-white px-3 text-sm hover:bg-red-100">
              <span>{r.date} · {formatMeters(r.meters)} km</span>
              <span className="text-xs font-medium text-red-700">보강하고 재제출 →</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
