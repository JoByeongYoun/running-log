'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatMeters } from '@/lib/domain/distance';
import { assignRanks } from '@/lib/domain/rank';
import { buildTrack, type TrackLane, type TrackSegment } from '@/lib/dashboard/track';
import { Avatar } from '@/components/ui/Avatar';
import { MemberModal } from './MemberModal';
import { RankBadge } from './RankBadge';
import { OUTCOME_LABEL, STATUS_LABEL, type MemberRow, type WeekDashboard } from '@/lib/dashboard/types';

/** 이 비율보다 양 끝에 가까우면 닉네임 태그를 프로필 가장자리에 붙여 트랙 밖으로 나가지 않게 한다. */
const TAG_EDGE_PCT = 14;
/** 레인 높이(px)와 그 안에서 트레일 중심선의 y 위치 */
const LANE_H = 64;
const TRAIL_Y = 33;
const TRAIL_H = 14;
/** 조각 안에 거리 라벨을 넣을 최소 폭(%) */
const LABEL_MIN_PCT = 10;
const AVATAR = 28;
/** 트랙 좌우 여백: 프로필이 출발선·끝에서 절반씩 걸치는 공간 */
const TRACK_PAD = AVATAR / 2 + 4;

function dateLabel(date: string) {
  const [, m, d] = date.split('-');
  return `${Number(m)}/${Number(d)}`;
}

export function WeekTrack({ data, myId }: { data: WeekDashboard; myId: string }) {
  const [profile, setProfile] = useState<MemberRow | null>(null);
  const [ran, setRan] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setRan(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const backParam = `?week=${data.week.weekStart}&from=home`;
  const track = buildTrack(data.members, data.week.targetMeters);
  // 판정용 순위(m.rank)는 준비 주간 멤버가 null이므로, 표시용 순위는 전체 멤버를 승인 거리로 매긴다.
  const finalized = data.week.state === 'finalized';
  const displayRank = new Map(assignRanks(data.members.map((m) => ({ userId: m.userId, totalMeters: m.approvedMeters }))).map((r) => [r.userId, r.rank]));

  return (
    <section className="track-stadium overflow-hidden rounded-2xl p-3 text-white shadow-md ring-1 ring-green-700/40 sm:p-4" aria-labelledby="week-track-title">
      <div className="track-text mb-3 flex items-center justify-between gap-2">
        <h2 id="week-track-title" className="flex items-center gap-1.5 font-bold tracking-tight">
          <span aria-hidden>🏟️</span> 주간 트랙
        </h2>
        <span className="rounded-full bg-white/25 px-2.5 py-0.5 text-xs font-semibold tabular-nums ring-1 ring-white/40">
          GOAL {formatMeters(data.week.targetMeters)} km
        </span>
      </div>

      {data.members.length === 0 ? (
        <p className="track-text py-4 text-center text-sm text-white/90">이 주에는 멤버가 없습니다.</p>
      ) : (
        <div className="flex items-stretch gap-2">
          {/* 순위 열: 확정된 주에만 메달을 보여준다 */}
          {finalized && (
            <ol className="flex w-7 shrink-0 flex-col pt-5" aria-hidden>
              {data.members.map((m) => (
                <li key={m.userId} className="flex items-start justify-center" style={{ height: LANE_H, paddingTop: TRAIL_Y - 10 }}>
                  <RankBadge rank={displayRank.get(m.userId)} />
                </li>
              ))}
            </ol>
          )}

          {/* 트랙 */}
          <div className="relative min-w-0 flex-1">
            {/* 결승 깃발 */}
            <div className="relative h-5" style={{ marginLeft: TRACK_PAD, marginRight: TRACK_PAD }}>
              <span className="absolute top-0 -translate-x-1/2 text-sm leading-none drop-shadow" style={{ left: `${track.goalPct}%` }} aria-hidden>🏁</span>
            </div>
            <div className="track-surface relative overflow-hidden rounded-xl ring-2 ring-white/80">
              {/* 출발선·결승선: 모든 레인 관통 */}
              <div className="pointer-events-none absolute inset-y-0 z-10" style={{ left: TRACK_PAD, right: TRACK_PAD }} aria-hidden>
                <div className="absolute inset-y-0 left-0 w-[3px] -translate-x-1/2 bg-white" />
                <div className="track-finish absolute inset-y-0 w-2.5 -translate-x-1/2 shadow-[0_0_0_1px_rgba(255,255,255,0.9)]" style={{ left: `${track.goalPct}%` }} />
              </div>
              <ul className="flex flex-col">
                {data.members.map((m) => (
                  <Lane
                    key={m.userId}
                    member={m}
                    lane={track.lanes.get(m.userId)!}
                    goalPct={track.goalPct}
                    targetMeters={data.week.targetMeters}
                    isMe={m.userId === myId}
                    ran={ran}
                    backParam={backParam}
                    onOpenProfile={() => setProfile(m)}
                  />
                ))}
              </ul>
            </div>
          </div>

        </div>
      )}

      <MemberModal member={profile} data={data} isMe={profile?.userId === myId} onClose={() => setProfile(null)} />
    </section>
  );
}

type LaneProps = {
  member: MemberRow;
  lane: TrackLane;
  goalPct: number;
  targetMeters: number;
  isMe: boolean;
  ran: boolean;
  backParam: string;
  onOpenProfile: () => void;
};

function Lane({ member: m, lane, goalPct, targetMeters, isMe, ran, backParam, onOpenProfile }: LaneProps) {
  const reachedGoal = m.approvedMeters > 0 && lane.approvedPct >= goalPct;
  const remaining = Math.max(0, targetMeters - m.approvedMeters);
  const status = m.leftDuringWeek || !m.activeNow ? '탈퇴' : m.resting ? '휴식' : null;
  const anchor = lane.approvedPct < TAG_EDGE_PCT ? 'start' : lane.approvedPct > 100 - TAG_EDGE_PCT ? 'end' : 'center';
  const tagShift = anchor === 'start' ? `-${AVATAR / 2}px` : anchor === 'end' ? `calc(-100% + ${AVATAR / 2}px)` : '-50%';
  const runnerLeft = ran ? `${lane.approvedPct}%` : '0%';

  return (
    <li className="track-lane relative" style={{ height: LANE_H }}>
      <div className="relative h-full" style={{ marginLeft: TRACK_PAD, marginRight: TRACK_PAD }}>
        {goalPct < 100 && <div className="track-overrun pointer-events-none absolute inset-y-0" style={{ left: `${goalPct}%`, right: -TRACK_PAD }} aria-hidden />}

        {/* 기록 조각(트레일): 하나가 하나의 기록 상세 링크 */}
        {lane.segments.map((s, i) => (
          <Segment key={s.id} seg={s} index={i} count={lane.segments.length} nickname={m.nickname} ran={ran} href={`/records/${s.id}${backParam}`} />
        ))}

        {/* 러너 */}
        <button
          type="button"
          onClick={onOpenProfile}
          aria-label={`${m.nickname} 이번 주 기록 보기 · 승인 ${formatMeters(m.approvedMeters)} km · ${reachedGoal ? '목표 달성' : `남은 ${formatMeters(remaining)} km`}${status ? ` · ${status}` : ''}`}
          className={`absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-full transition-[left] duration-1000 ease-out hover:scale-110 active:scale-95 motion-reduce:transition-none ${isMe ? 'track-runner-me' : 'shadow-[0_2px_6px_rgba(0,0,0,0.4)] ring-2 ring-white'}`}
          style={{ left: runnerLeft, top: TRAIL_Y, width: AVATAR, height: AVATAR }}
        >
          <span className={`block rounded-full ${isMe && ran ? 'track-bob' : ''}`}>
            <Avatar src={m.avatarUrl ?? null} name={m.nickname} size={AVATAR} resting={m.resting} />
          </span>
          <span className="sr-only">{OUTCOME_LABEL[m.outcome]}</span>
        </button>

        {/* 닉네임 태그 */}
        <div
          className={`pointer-events-none absolute top-1 z-20 flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-[11px] font-bold leading-4 shadow-sm transition-[left] duration-1000 ease-out motion-reduce:transition-none ${isMe ? 'bg-yellow-300 text-yellow-950' : 'bg-white text-slate-900'}`}
          style={{ left: runnerLeft, transform: `translateX(${tagShift})` }}
          aria-hidden
        >
          {m.nickname}
          {status && <span className="text-[9px] font-medium opacity-70">{status}</span>}
        </div>

        {/* 거리 줄: 러너 아래 한 줄로 총 거리와 남은 거리 */}
        <div
          className={`track-text pointer-events-none absolute z-20 whitespace-nowrap rounded-md bg-black/30 px-1.5 py-0.5 text-[10px] font-bold tabular-nums leading-none transition-[left] duration-1000 ease-out motion-reduce:transition-none ${reachedGoal ? 'text-yellow-300' : 'text-white'}`}
          style={{ left: runnerLeft, top: TRAIL_Y + AVATAR / 2 + 2, transform: `translateX(${tagShift})` }}
          aria-hidden
        >
          {formatMeters(m.approvedMeters)}
          <span className={`ml-1 font-semibold ${reachedGoal ? 'text-yellow-200' : 'text-white/80'}`}>
            {reachedGoal ? (lane.overMeters > 0 ? `+${formatMeters(lane.overMeters)} 🎉` : 'GOAL! 🎉') : `${formatMeters(remaining)} 남음`}
          </span>
        </div>
      </div>
    </li>
  );
}

function Segment({ seg, index, count, nickname, ran, href }: { seg: TrackSegment; index: number; count: number; nickname: string; ran: boolean; href: string }) {
  const label = `${nickname} ${dateLabel(seg.date)} 기록 ${formatMeters(seg.meters)} km · ${STATUS_LABEL[seg.status]}`;
  const tone = seg.status === 'pending' ? 'track-seg-pending' : `track-seg-approved ${index % 2 ? 'is-alt' : ''}`;
  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      className="group absolute h-10 min-w-[10px] -translate-y-1/2 outline-none"
      style={{ top: TRAIL_Y, left: `${seg.startPct}%`, width: `${seg.widthPct}%`, zIndex: count - index }}
    >
      <span
        className={`absolute inset-x-0 top-1/2 origin-left border-r-2 border-[#d5503a]/70 transition-transform duration-1000 ease-out group-hover:brightness-110 group-focus-visible:ring-2 group-focus-visible:ring-white motion-reduce:transition-none ${tone} ${index === 0 ? 'rounded-l-full' : ''} ${index === count - 1 ? 'rounded-r-full border-r-0' : ''}`}
        style={{ height: TRAIL_H, transform: `translateY(-50%) scaleX(${ran ? 1 : 0})`, transitionDelay: `${Math.min(index, 6) * 90}ms` }}
      >
        {seg.widthPct >= LABEL_MIN_PCT && (
          <span className="absolute inset-0 flex items-center justify-center truncate px-1 text-[9px] font-bold leading-none text-lime-950/80" aria-hidden>
            {formatMeters(seg.meters)}
          </span>
        )}
      </span>
    </Link>
  );
}
