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
/** 레인 높이(px)와 그 안에서 바 중심선의 y 위치 */
const LANE_H = 60;
const BAR_Y = 41;
/** 조각 안에 거리 라벨을 넣을 최소 폭(%) */
const LABEL_MIN_PCT = 11;
const AVATAR = 28;

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
    <section className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-3 sm:p-4" aria-labelledby="week-track-title">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="week-track-title" className="flex items-center gap-1.5 font-semibold">
          <span aria-hidden>🏁</span> 주간 트랙
        </h2>
        <div className="flex items-center gap-1.5">
          {data.provisional && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">{data.week.state === 'closing' ? '집계 중' : '잠정'}</span>}
          <span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs font-medium text-white">목표 {formatMeters(data.week.targetMeters)} km</span>
        </div>
      </div>

      {data.members.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">이 주에는 멤버가 없습니다.</p>
      ) : (
        <div className="flex gap-2">
          {/* 순위 열 */}
          <ol className="flex w-6 shrink-0 flex-col pt-6" aria-hidden>
            {data.members.map((m) => (
              <li key={m.userId} className="flex items-start justify-center" style={{ height: LANE_H, paddingTop: BAR_Y - 10 }}>
                <RankBadge rank={displayRank.get(m.userId)} />
              </li>
            ))}
          </ol>

          {/* 트랙: 좌우 여백은 프로필이 트랙 끝에서 절반씩 걸치는 공간 */}
          <div className="relative min-w-0 flex-1" style={{ paddingLeft: AVATAR / 2, paddingRight: AVATAR / 2 }}>
            <div className="relative">
              {/* START / GOAL 마커: 모든 레인을 관통하는 세로 점선 */}
              <div className="relative h-6 text-[10px] font-semibold tracking-wider text-slate-400">
                <span className="absolute left-0 top-0.5 -translate-x-1/2">START</span>
                <span className="absolute top-0 -translate-x-1/2 whitespace-nowrap rounded-full bg-white px-1.5 py-0.5 text-slate-700 shadow-sm ring-1 ring-slate-200" style={{ left: `${track.goalPct}%` }}>
                  <span aria-hidden>🏁</span> GOAL
                </span>
              </div>
              <div className="pointer-events-none absolute bottom-0 top-6 z-10 border-l-2 border-dashed border-slate-300/90" style={{ left: `${track.goalPct}%` }} aria-hidden />

              <ul className="flex flex-col">
                {data.members.map((m) => (
                  <Lane
                    key={m.userId}
                    member={m}
                    lane={track.lanes.get(m.userId)!}
                    goalPct={track.goalPct}
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

      <Legend />
      <MemberModal member={profile} data={data} isMe={profile?.userId === myId} onClose={() => setProfile(null)} />
    </section>
  );
}

type LaneProps = {
  member: MemberRow;
  lane: TrackLane;
  goalPct: number;
  isMe: boolean;
  ran: boolean;
  backParam: string;
  onOpenProfile: () => void;
};

function Lane({ member: m, lane, goalPct, isMe, ran, backParam, onOpenProfile }: LaneProps) {
  const sidelined = m.joinedThisWeek || m.leftDuringWeek || !m.activeNow;
  const reachedGoal = m.approvedMeters > 0 && lane.approvedPct >= goalPct;
  const status = m.joinedThisWeek ? '준비 주간' : (m.leftDuringWeek || !m.activeNow) ? '탈퇴' : null;
  // 캡션이 트랙 밖으로 나가지 않도록 양 끝에서는 프로필 가장자리에 맞춰 정렬한다.
  const anchor = lane.approvedPct < CAPTION_EDGE_PCT ? 'start' : lane.approvedPct > 100 - CAPTION_EDGE_PCT ? 'end' : 'center';
  const captionShift = anchor === 'start' ? `-${AVATAR / 2}px` : anchor === 'end' ? `calc(-100% + ${AVATAR / 2}px)` : '-50%';
  const runnerLeft = ran ? `${lane.approvedPct}%` : '0%';

  return (
    <li className="relative" style={{ height: LANE_H }}>
      {/* 레인 바 */}
      <div className={`absolute inset-x-0 h-4 overflow-hidden rounded-full bg-slate-100 ring-1 ring-inset ${isMe ? 'ring-emerald-300' : 'ring-slate-200/80'}`} style={{ top: BAR_Y - 8 }} aria-hidden>
        <div className="absolute inset-y-0 left-2 right-2 top-1/2 border-t-2 border-dashed border-white" />
        {/* 골 너머 오버런 구간 */}
        {goalPct < 100 && <div className="track-overrun absolute inset-y-0 right-0" style={{ left: `${goalPct}%` }} />}
      </div>

      {/* 기록 조각들: 하나가 하나의 기록 상세 링크 */}
      {lane.segments.map((s, i) => (
        <Segment key={s.id} seg={s} index={i} count={lane.segments.length} nickname={m.nickname} ran={ran} href={`/records/${s.id}${backParam}`} />
      ))}

      {/* 러너: 승인 합계 지점에 프로필 사진이 서고, 그 위에 닉네임·거리 캡션이 따라간다. */}
      <button
        type="button"
        onClick={onOpenProfile}
        aria-label={`${m.nickname} 이번 주 기록 보기 · 승인 ${formatMeters(m.approvedMeters)} km${status ? ` · ${status}` : ''}`}
        className={`track-runner absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-md ring-2 transition-[left] duration-1000 ease-out hover:shadow-lg active:scale-95 motion-reduce:transition-none ${isMe ? 'ring-emerald-400' : 'ring-white'} ${sidelined ? 'grayscale' : ''}`}
        style={{ left: runnerLeft, top: BAR_Y, width: AVATAR, height: AVATAR }}
      >
        <span className={`block rounded-full ${isMe && ran ? 'track-bob' : ''}`}>
          <Avatar src={m.avatarUrl ?? null} name={m.nickname} size={AVATAR} />
        </span>
        {lane.overMeters > 0 && <span className="absolute -right-1.5 -top-1.5 text-xs leading-none" aria-hidden>🎉</span>}
        <span className="sr-only">{OUTCOME_LABEL[m.outcome]}</span>
      </button>
      <div
        className="pointer-events-none absolute top-0 z-20 flex max-w-[60%] items-baseline gap-1 whitespace-nowrap rounded-full bg-white/90 px-1.5 py-px text-[11px] leading-4 shadow-sm ring-1 ring-slate-200/80 backdrop-blur-[2px] transition-[left] duration-1000 ease-out motion-reduce:transition-none"
        style={{ left: runnerLeft, transform: `translateX(${captionShift})` }}
        aria-hidden
      >
        <span className={`truncate font-semibold ${sidelined ? 'text-slate-500' : 'text-slate-900'}`}>{m.nickname}</span>
        {isMe && <span className="shrink-0 rounded-full bg-emerald-500 px-1 text-[9px] font-bold leading-3.5 text-white">나</span>}
        {status ? (
          <span className="shrink-0 text-[10px] text-slate-500">{status}</span>
        ) : (
          <span className={`shrink-0 tabular-nums ${reachedGoal ? 'font-semibold text-emerald-700' : 'text-slate-600'}`}>
            {formatMeters(m.approvedMeters)}
            {lane.overMeters > 0 && <span className="ml-0.5 text-[10px] text-emerald-600">+{formatMeters(lane.overMeters)}</span>}
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
    : index % 2 === 0 ? 'bg-gradient-to-b from-emerald-400 to-emerald-600 text-white' : 'bg-gradient-to-b from-teal-400 to-teal-600 text-white';
  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      className="group absolute h-9 min-w-[10px] -translate-y-1/2 outline-none"
      style={{ top: BAR_Y, left: `${seg.startPct}%`, width: `${seg.widthPct}%`, zIndex: count - index }}
    >
      <span
        className={`track-seg absolute inset-x-0 top-1/2 h-4 -translate-y-1/2 origin-left border-r border-white/90 transition-transform duration-1000 ease-out group-hover:brightness-110 group-focus-visible:ring-2 group-focus-visible:ring-sky-400 motion-reduce:transition-none ${tone} ${index === 0 ? 'rounded-l-full' : ''} ${index === count - 1 ? 'rounded-r-full' : ''}`}
        style={{ transform: `translateY(-50%) scaleX(${ran ? 1 : 0})`, transitionDelay: `${Math.min(index, 6) * 90}ms` }}
      >
        {seg.widthPct >= LABEL_MIN_PCT && (
          <span className="absolute inset-0 flex items-center justify-center truncate px-1 text-[10px] font-semibold leading-none drop-shadow-sm" aria-hidden>
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
      <li className="flex items-center gap-1"><span className="inline-block h-2.5 w-4 rounded-full bg-gradient-to-b from-emerald-400 to-emerald-600" aria-hidden />승인된 기록</li>
      <li className="flex items-center gap-1"><span className="track-seg-pending inline-block h-2.5 w-4 rounded-full" aria-hidden />승인 대기</li>
      <li className="flex items-center gap-1"><span className="inline-block h-2.5 border-l-2 border-dashed border-slate-300" aria-hidden />목표 지점</li>
      <li className="ml-auto text-slate-400">조각을 누르면 기록 상세로 이동</li>
    </ul>
  );
}
