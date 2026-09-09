import { forwardRef } from 'react';
import { formatMeters } from '@/lib/domain/distance';
import { assignRanks } from '@/lib/domain/rank';
import { formatWeekRange } from '@/lib/domain/week';
import { Avatar } from '@/components/ui/Avatar';
import type { WeekSummary, MemberRow } from '@/lib/dashboard/types';

export const PAGE_SIZE = 12;

function outcomeText(m: MemberRow): string {
  if (m.joinedThisWeek || !m.eligible) return '준비 주간';
  switch (m.outcome) {
    case 'success': case 'provisional_success': return '성공';
    case 'fail': case 'provisional_fail': return '실패';
    case 'pending_review': return '판정 대기';
    default: return '';
  }
}

export const SummaryCard = forwardRef<HTMLDivElement, { summary: WeekSummary; page: number; pageCount: number }>(function SummaryCard({ summary, page, pageCount }, ref) {
  const { week, members, myUserId } = summary;
  const slice = members.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const me = members.find((m) => m.userId === myUserId);
  // 판정용 순위(m.rank)는 준비 주간 멤버가 null이므로, 표시용 순위는 전체 멤버를 승인 거리로 매긴다.
  const displayRank = new Map(assignRanks(members.map((m) => ({ userId: m.userId, totalMeters: m.approvedMeters }))).map((r) => [r.userId, r.rank]));
  const successes = members.filter((m) => m.eligible && (m.outcome === 'success' || m.outcome === 'provisional_success'));
  const failures = members.filter((m) => m.eligible && (m.outcome === 'fail' || m.outcome === 'provisional_fail'));
  const preps = members.filter((m) => !m.eligible);
  return (
    <div ref={ref} className="w-full rounded-2xl bg-white p-5 text-slate-900" style={{ fontFamily: 'inherit' }}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-slate-500">{week.groupName}</p>
          <h3 className="text-lg font-bold">주간 요약 · {formatWeekRange(week.weekStart)}</h3>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs ${summary.provisional ? 'bg-amber-100 text-amber-800' : 'bg-slate-900 text-white'}`}>{summary.provisional ? '잠정 결과' : '확정'}</span>
      </div>
      <p className="mt-1 text-sm text-slate-600">주간 목표 {formatMeters(week.targetMeters)} km · 벌칙: {week.penalty}</p>
      {me && page === 0 && (
        <div className={`mt-3 rounded-xl p-3 ${me.outcome.includes('success') ? 'bg-emerald-50' : me.outcome.includes('fail') ? 'bg-red-50' : 'bg-slate-50'}`}>
          <p className="text-xs text-slate-500">나의 결과</p>
          <p className="text-xl font-bold">{outcomeText(me)} · {formatMeters(me.approvedMeters)} km{` · ${displayRank.get(me.userId)}위`}</p>
        </div>
      )}
      <ol className="mt-3 divide-y divide-slate-100">
        {slice.map((m) => (
          <li key={m.userId} className={`flex items-center gap-2 py-1.5 text-sm ${m.userId === myUserId ? 'font-semibold' : ''}`}>
            <span className="w-8 text-slate-500">{displayRank.get(m.userId)}위</span>
            <Avatar src={m.avatarUrl ?? null} name={m.nickname} size={24} />
            <span className="min-w-0 flex-1 truncate">{m.nickname}{m.leftDuringWeek || !m.activeNow ? <span className="ml-1 text-xs font-normal text-slate-400">탈퇴</span> : null}</span>
            <span className="tabular-nums">{formatMeters(m.approvedMeters)} km</span>
            <span className={`w-14 text-right text-xs ${outcomeText(m) === '성공' ? 'text-emerald-700' : outcomeText(m) === '실패' ? 'text-red-600' : 'text-slate-500'}`}>{outcomeText(m)}</span>
          </li>
        ))}
      </ol>
      {pageCount > 1 && <p className="mt-1 text-right text-xs text-slate-400">{page + 1} / {pageCount}</p>}
      {page === pageCount - 1 && (
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl bg-slate-50 p-2"><p className="text-slate-500">그룹 합계</p><p className="text-base font-bold">{formatMeters(summary.groupTotalMeters)} km</p></div>
          <div className="rounded-xl bg-slate-50 p-2"><p className="text-slate-500">성공 인원</p><p className="text-base font-bold">{summary.evaluatedCount === 0 ? '평가 대상 없음' : `${summary.successCount} / ${summary.evaluatedCount}명`}</p></div>
          <div className="col-span-2 rounded-xl bg-slate-50 p-2">
            <p><span className="text-slate-500">성공</span> {successes.map((m) => m.nickname).join(', ') || '없음'}</p>
            <p><span className="text-slate-500">실패</span> {failures.map((m) => m.nickname).join(', ') || '없음'}</p>
            {preps.length > 0 && <p><span className="text-slate-500">준비 주간</span> {preps.map((m) => m.nickname).join(', ')}</p>}
          </div>
        </div>
      )}
    </div>
  );
});
