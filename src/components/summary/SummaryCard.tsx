import { forwardRef } from 'react';
import { formatMeters } from '@/lib/domain/distance';
import { assignRanks } from '@/lib/domain/rank';
import { formatWeekRange } from '@/lib/domain/week';
import { Avatar } from '@/components/ui/Avatar';
import { RankBadge } from '@/components/dashboard/RankBadge';
import type { WeekSummary, MemberRow, SummaryPhoto } from '@/lib/dashboard/types';

export const PAGE_SIZE = 12;

function outcomeText(m: MemberRow): string {
  if (m.runnerType === 'injured') return '부상';
  if (m.joinedThisWeek || !m.eligible) return '준비 주간';
  switch (m.outcome) {
    case 'success': case 'provisional_success': return '성공';
    case 'fail': case 'provisional_fail': return '실패';
    case 'pending_review': return '판정 대기';
    default: return '';
  }
}

/** 금·은·동 단상. 가운데가 1위, 왼쪽 2위, 오른쪽 3위. 열정러너 1위가 없으면 그리지 않는다. */
function Podium({ members, displayRank, myUserId }: { members: MemberRow[]; displayRank: Map<string, number>; myUserId: string }) {
  const byRank = (r: number) => members.filter((m) => displayRank.get(m.userId) === r);
  const steps: { rank: number; h: string; tone: string; medal: string }[] = [
    { rank: 2, h: 'h-16', tone: 'from-slate-200 to-slate-400', medal: '🥈' },
    { rank: 1, h: 'h-24', tone: 'from-yellow-200 to-amber-400', medal: '🥇' },
    { rank: 3, h: 'h-11', tone: 'from-orange-300 to-amber-700', medal: '🥉' },
  ];
  if (byRank(1).length === 0) return null;
  return (
    <div className="mt-4 rounded-2xl bg-gradient-to-b from-sky-50 to-white px-3 pt-2 pb-0" data-testid="summary-podium">
      <p className="text-center text-xs font-semibold tracking-wide text-slate-500">이번 주 시상대</p>
      <div className="mt-1 flex items-end justify-center gap-2">
        {steps.map(({ rank, h, tone, medal }) => {
          const who = byRank(rank);
          if (who.length === 0) return <div key={rank} className="w-1/3" />;
          return (
            <div key={rank} className="flex w-1/3 flex-col items-center">
              <div className="flex -space-x-2">
                {who.slice(0, 3).map((m) => (
                  <span key={m.userId} className={`rounded-full ring-2 ring-white ${m.userId === myUserId ? 'ring-offset-2 ring-offset-sky-200' : ''}`}>
                    <Avatar src={m.avatarUrl ?? null} name={m.nickname} size={rank === 1 ? 44 : 36} />
                  </span>
                ))}
              </div>
              <p className="mt-1 max-w-full truncate text-center text-xs font-semibold">{who.map((m) => m.nickname).join(' · ')}</p>
              <p className="text-[11px] tabular-nums text-slate-500">{formatMeters(who[0].approvedMeters)} km</p>
              <div className={`mt-1 flex w-full ${h} flex-col items-center justify-start rounded-t-xl bg-gradient-to-b ${tone} pt-1 shadow-inner`}>
                <span className="text-lg leading-none">{medal}</span>
                <span className="text-xs font-bold text-slate-800/80">{rank}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 이번 주 올라온 인증 사진 모자이크. 최대 9장, 정사각 타일. 저장 이미지에도 그대로 들어간다. */
function PhotoCollage({ photos }: { photos: SummaryPhoto[] }) {
  if (photos.length === 0) return null;
  const cols = photos.length === 1 ? 'grid-cols-1' : photos.length <= 4 ? 'grid-cols-2' : 'grid-cols-3';
  return (
    <div className="mt-4" data-testid="summary-collage">
      <p className="text-xs font-semibold tracking-wide text-slate-500">이번 주 다들 이렇게 뛰었어요 📸</p>
      <div className={`mt-1.5 grid ${cols} gap-1 overflow-hidden rounded-2xl`}>
        {photos.map((p) => (
          <div key={p.recordId} className="relative aspect-square overflow-hidden bg-slate-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt={`${p.nickname}의 인증 사진`} className="h-full w-full object-cover" />
            <span className="absolute bottom-1 left-1 max-w-[90%] truncate rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">{p.nickname}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export const SummaryCard = forwardRef<HTMLDivElement, { summary: WeekSummary; page: number; pageCount: number }>(function SummaryCard({ summary, page, pageCount }, ref) {
  const { week, members, myUserId } = summary;
  const slice = members.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const me = members.find((m) => m.userId === myUserId);
  // 판정용 순위(m.rank)는 준비 주간 멤버가 null이므로, 표시용 순위는 열정러너 전체를 승인 거리로 매긴다. 자유·부상은 순위 없음.
  const displayRank = new Map(assignRanks(members.filter((m) => m.runnerType === 'passion').map((m) => ({ userId: m.userId, totalMeters: m.approvedMeters }))).map((r) => [r.userId, r.rank]));
  const successes = members.filter((m) => m.eligible && (m.outcome === 'success' || m.outcome === 'provisional_success'));
  const failures = members.filter((m) => m.eligible && (m.outcome === 'fail' || m.outcome === 'provisional_fail'));
  const injured = members.filter((m) => m.runnerType === 'injured');
  const preps = members.filter((m) => !m.eligible && m.runnerType !== 'injured');
  return (
    <div ref={ref} className="w-full rounded-2xl bg-white p-5 text-slate-900" style={{ fontFamily: 'inherit' }}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-slate-500">{week.groupName}</p>
          <h3 className="text-lg font-bold">주간 요약 · {formatWeekRange(week.weekStart)}</h3>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs ${summary.provisional ? 'bg-amber-100 text-amber-800' : 'bg-slate-900 text-white'}`}>{summary.provisional ? '잠정 결과' : '확정'}</span>
      </div>
      <p className="mt-1 text-sm text-slate-600">열정 {formatMeters(week.targetMeters)}km · 자유 {formatMeters(week.freeMinMeters)}km{week.penalty ? ` · ${week.penalty}` : ''}</p>
      {page === 0 && <Podium members={members} displayRank={displayRank} myUserId={myUserId} />}
      {page === 0 && <PhotoCollage photos={summary.photos ?? []} />}
      {me && page === 0 && (
        <div className={`mt-3 rounded-xl p-3 ${me.outcome.includes('success') ? 'bg-emerald-50' : me.outcome.includes('fail') ? 'bg-red-50' : 'bg-slate-50'}`}>
          <p className="text-xs text-slate-500">나의 결과</p>
          <p className="text-xl font-bold">{outcomeText(me)} · {formatMeters(me.approvedMeters)} km{displayRank.has(me.userId) ? ` · ${displayRank.get(me.userId)}위` : ''}</p>
        </div>
      )}
      <ol className="mt-3 divide-y divide-slate-100">
        {slice.map((m) => (
          <li key={m.userId} className={`flex items-center gap-2 py-1.5 text-sm ${m.userId === myUserId ? 'font-semibold' : ''}`}>
            <span className="flex w-8 justify-center"><RankBadge rank={displayRank.get(m.userId)} /></span>
            <Avatar src={m.avatarUrl ?? null} name={m.nickname} size={24} badge={m.runnerType} />
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
            {injured.length > 0 && <p><span className="text-slate-500">부상</span> {injured.map((m) => m.nickname).join(', ')}</p>}
          </div>
        </div>
      )}
    </div>
  );
});
