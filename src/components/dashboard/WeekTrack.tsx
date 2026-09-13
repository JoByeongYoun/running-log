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

/** 이 비율보다 양 끝에 가까우면 캡션을 프로필 가장자리에 붙여 트랙 밖으로 나가지 않게 한다. */
const CAPTION_EDGE_PCT = 14;
/** 레인 높이(px)와 그 안에서 달린 자취(조각) 중심선의 y 위치 */
const LANE_H = 70;
const TRAIL_Y = 38;
const TRAIL_H = 18;
/** 레인 하단 거리 표기 줄의 y 위치 */
const STAT_Y = 55;
/** 러너가 이 지점을 넘으면 총 거리 표기를 프로필 왼쪽으로 옮겨 남은 거리와 겹치지 않게 한다. */
const TOTAL_FLIP_PCT = 60;
/** 조각 안에 거리 라벨을 넣을 최소 폭(%) */
const LABEL_MIN_PCT = 11;
const AVATAR = 30;
/** 트랙 좌우 여백: 프로필이 START/끝에서 절반씩 걸치는 공간 */
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
  const displayRank = new Map(assignRanks(data.members.map((m) => ({ userId: m.userId, totalMeters: m.approvedMeters }))).map((r) => [r.userId, r.rank]));

  return (
    <section className="rounded-2xl border border-slate-200 p-3 sm:p-4" aria-labelledby="week-track-title">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="week-track-title" className="flex items-center gap-1.5 font-semibold">
          <span aria-hidden>🏟️</span> 주간 트랙
        </h2>
        <div className="flex items-center gap-1.5">
          {data.provisional && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">{data.week.state === 'closing' ? '집계 중' : '잠정'}</span>}
          <span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs font-medium text-white">목표 {formatMeters(data.week.targetMeters)} km</span>
        </div>
      </div>

      {data.members.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">이 주에는 멤버가 없습니다.</p>
      ) : (
        /* 잔디 인필드 위에 놓인 트랙 */
        <div className="track-grass flex gap-1.5 rounded-2xl p-2 shadow-inner">
          {/* 순위 열 (잔디 위) */}
          <ol className="flex w-7 shrink-0 flex-col pt-7" aria-hidden>
            {data.members.map((m) => (
              <li key={m.userId} className="flex items-start justify-center" style={{ height: LANE_H, paddingTop: TRAIL_Y - 10 }}>
                <RankBadge rank={displayRank.get(m.userId)} />
              </li>
            ))}
          </ol>

          <div className="relative min-w-0 flex-1">
            {/* START / FINISH 라벨 */}
            <div className="relative h-7 text-[10px] font-bold tracking-widest text-white drop-shadow" style={{ marginLeft: TRACK_PAD, marginRight: TRACK_PAD }}>
              <span className="absolute left-0 top-1 -translate-x-1/2">START</span>
              <span className="absolute top-0 -translate-x-1/2 whitespace-nowrap rounded-full bg-white px-1.5 py-0.5 text-slate-800 shadow-sm" style={{ left: `${track.goalPct}%` }}>
                <span aria-hidden>🏁</span> FINISH
              </span>
            </div>

            {/* 붉은 타탄 트랙: 흰 테두리 + 레인 */}
            <div className="track-surface relative overflow-hidden rounded-xl ring-2 ring-white/90">
              {/* 출발선·결승선: 모든 레인을 관통 */}
              <div className="pointer-events-none absolute inset-y-0 z-10" style={{ left: TRACK_PAD, right: TRACK_PAD }} aria-hidden>
                <div className="absolute inset-y-0 left-0 w-[3px] -translate-x-1/2 bg-white" />
                <div className="track-finish absolute inset-y-0 w-2.5 -translate-x-1/2 shadow-[0_0_0_1px_rgba(255,255,255,0.9)]" style={{ left: `${track.goalPct}%` }} />
              </div>
              <div className="relative">
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
        </div>
      )}

      <Legend />
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
  const status = m.leftDuringWeek || !m.activeNow ? '탈퇴' : null;
  // 캡션이 트랙 밖으로 나가지 않도록 양 끝에서는 프로필 가장자리에 맞춰 정렬한다.
  const anchor = lane.approvedPct < CAPTION_EDGE_PCT ? 'start' : lane.approvedPct > 100 - CAPTION_EDGE_PCT ? 'end' : 'center';
  const captionShift = anchor === 'start' ? `-${AVATAR / 2}px` : anchor === 'end' ? `calc(-100% + ${AVATAR / 2}px)` : '-50%';
  const runnerLeft = ran ? `${lane.approvedPct}%` : '0%';
  const totalOnLeft = lane.approvedPct > TOTAL_FLIP_PCT;

  return (
    <li className="track-lane relative" style={{ height: LANE_H }}>
      <div className="relative h-full" style={{ marginLeft: TRACK_PAD, marginRight: TRACK_PAD }}>
        {/* 결승선 너머 오버런 구간 */}
        {goalPct < 100 && <div className="track-overrun pointer-events-none absolute inset-y-0" style={{ left: `${goalPct}%`, right: -TRACK_PAD }} aria-hidden />}

        {/* 기록 조각들(달린 자취): 하나가 하나의 기록 상세 링크 */}
        {lane.segments.map((s, i) => (
          <Segment key={s.id} seg={s} index={i} count={lane.segments.length} nickname={m.nickname} ran={ran} href={`/records/${s.id}${backParam}`} />
        ))}

        {/* 러너: 승인 합계 지점에 프로필 사진이 서고, 그 위에 닉네임·거리 캡션이 따라간다. */}
        <button
          type="button"
          onClick={onOpenProfile}
          aria-label={`${m.nickname} 이번 주 기록 보기 · 승인 ${formatMeters(m.approvedMeters)} km · ${reachedGoal ? '목표 달성' : `남은 ${formatMeters(remaining)} km`}${status ? ` · ${status}` : ''}`}
          className={`track-runner absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_2px_6px_rgba(0,0,0,0.35)] ring-2 transition-[left] duration-1000 ease-out hover:scale-105 active:scale-95 motion-reduce:transition-none ${isMe ? 'ring-lime-300' : 'ring-white'}`}
          style={{ left: runnerLeft, top: TRAIL_Y, width: AVATAR, height: AVATAR }}
        >
          <span className={`block rounded-full ${isMe && ran ? 'track-bob' : ''}`}>
            <Avatar src={m.avatarUrl ?? null} name={m.nickname} size={AVATAR} />
          </span>
            <span className="sr-only">{OUTCOME_LABEL[m.outcome]}</span>
        </button>
        {/* 닉네임 캡션: 이름만, 잘리지 않게 */}
        <div
          className="pointer-events-none absolute top-1 z-20 flex items-center gap-1 whitespace-nowrap rounded-full bg-white px-1.5 py-px text-[11px] font-semibold leading-4 text-slate-900 shadow-sm transition-[left] duration-1000 ease-out motion-reduce:transition-none"
          style={{ left: runnerLeft, transform: `translateX(${captionShift})` }}
          aria-hidden
        >
          {m.nickname}
          {isMe && <span className="rounded-full bg-lime-500 px-1 text-[9px] font-bold leading-3.5 text-white">나</span>}
          {status && <span className="text-[10px] font-normal text-slate-500">{status}</span>}
        </div>

        {/* 총 거리: 러너 옆, 레인 하단 흰 글씨 */}
        <span
          className="pointer-events-none absolute z-10 whitespace-nowrap text-[10px] font-bold tabular-nums leading-none text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)] transition-[left] duration-1000 ease-out motion-reduce:transition-none"
          style={{ left: runnerLeft, top: STAT_Y, transform: totalOnLeft ? `translateX(calc(-100% - ${AVATAR / 2 + 3}px))` : `translateX(${AVATAR / 2 + 3}px)` }}
          aria-hidden
        >
          {formatMeters(m.approvedMeters)} km
          {reachedGoal && <span className="ml-1 text-lime-200">{lane.overMeters > 0 ? `+${formatMeters(lane.overMeters)} 초과` : '달성'} 🎉</span>}
        </span>

        {/* 남은 거리: 결승선 앞, 레인 하단 (목표 달성 후에는 총 거리 옆에 합쳐 표시) */}
        {!reachedGoal && (
          <span
            className="pointer-events-none absolute z-10 -translate-x-full whitespace-nowrap text-[10px] font-medium tabular-nums leading-none text-white/85 drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)]"
            style={{ left: `calc(${goalPct}% - 9px)`, top: STAT_Y }}
            aria-hidden
          >
            {formatMeters(remaining)} 남음
          </span>
        )}
      </div>
    </li>
  );
}

function Segment({ seg, index, count, nickname, ran, href }: { seg: TrackSegment; index: number; count: number; nickname: string; ran: boolean; href: string }) {
  const label = `${nickname} ${dateLabel(seg.date)} 기록 ${formatMeters(seg.meters)} km · ${STATUS_LABEL[seg.status]}`;
  const tone = seg.status === 'pending'
    ? 'track-seg-pending text-amber-900'
    : index % 2 === 0 ? 'bg-gradient-to-b from-lime-200 to-lime-400 text-lime-950' : 'bg-gradient-to-b from-lime-100 to-lime-300 text-lime-950';
  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      className="group absolute h-10 min-w-[10px] -translate-y-1/2 outline-none"
      style={{ top: TRAIL_Y, left: `${seg.startPct}%`, width: `${seg.widthPct}%`, zIndex: count - index }}
    >
      <span
        className={`absolute inset-x-0 top-1/2 origin-left border-r border-white/90 shadow-[0_1px_2px_rgba(0,0,0,0.25)] transition-transform duration-1000 ease-out group-hover:brightness-105 group-focus-visible:ring-2 group-focus-visible:ring-white motion-reduce:transition-none ${tone} ${index === 0 ? 'rounded-l-full' : ''} ${index === count - 1 ? 'rounded-r-full' : ''}`}
        style={{ height: TRAIL_H, transform: `translateY(-50%) scaleX(${ran ? 1 : 0})`, transitionDelay: `${Math.min(index, 6) * 90}ms` }}
      >
        {seg.widthPct >= LABEL_MIN_PCT && (
          <span className="absolute inset-0 flex items-center justify-center truncate px-1 text-[10px] font-bold leading-none" aria-hidden>
            {formatMeters(seg.meters)}
          </span>
        )}
      </span>
    </Link>
  );
}

function Legend() {
  return (
    <ul className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500" aria-label="범례">
      <li className="flex items-center gap-1"><span className="inline-block h-2.5 w-4 rounded-full bg-gradient-to-b from-lime-200 to-lime-400 ring-1 ring-lime-500/40" aria-hidden />승인된 기록</li>
      <li className="flex items-center gap-1"><span className="track-seg-pending inline-block h-2.5 w-4 rounded-full ring-1 ring-amber-400/60" aria-hidden />승인 대기</li>
      <li className="flex items-center gap-1"><span className="track-finish inline-block h-3 w-2" aria-hidden />목표(결승선)</li>
      <li className="ml-auto text-slate-400">조각을 누르면 기록 상세로 이동</li>
    </ul>
  );
}
