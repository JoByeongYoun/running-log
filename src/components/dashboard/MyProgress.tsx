import { formatMeters } from '@/lib/domain/distance';
import type { WeekDashboard } from '@/lib/dashboard/types';

export function MyProgress({ data }: { data: WeekDashboard }) {
  const { me, week } = data;
  const pct = Math.min(100, Math.round((me.approvedMeters / week.targetMeters) * 100));
  const remaining = Math.max(0, week.targetMeters - me.approvedMeters);
  const over = Math.max(0, me.approvedMeters - week.targetMeters);
  return (
    <section className="rounded-2xl border border-slate-200 p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-sm text-slate-500">주간 목표 <b className="text-slate-900">{formatMeters(week.targetMeters)} km</b></p>
        <p className="text-xs text-slate-500">벌칙: {week.penalty}</p>
      </div>
      {me.inWeek ? (
        <>
          <div className="mt-3 flex items-end justify-between">
            <p className="text-2xl font-bold">{formatMeters(me.approvedMeters)} <span className="text-sm font-normal text-slate-500">km 승인</span></p>
            <p className="text-sm text-slate-600">{remaining > 0 ? `남은 ${formatMeters(remaining)} km` : `목표 달성${over > 0 ? ` · +${formatMeters(over)} km 초과` : ''}`}</p>
          </div>
          <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="나의 진행률">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-1 flex justify-between text-xs text-slate-500">
            <span>{pct}%</span>
            {me.pendingMeters > 0 && <span>승인 대기 {formatMeters(me.pendingMeters)} km (합계 미포함)</span>}
          </div>
          {!me.eligible && <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">이번 주는 준비 주간입니다. 기록은 남지만 순위·성공/실패 평가에서 제외되고, 다음 주부터 평가됩니다.</p>}
        </>
      ) : (
        <p className="mt-3 text-sm text-slate-500">이 주에는 참여 이력이 없습니다.</p>
      )}
    </section>
  );
}
