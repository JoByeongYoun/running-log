import type { DayCell } from './types';

/** 트랙 위에 그려지는 기록 한 조각. 퍼센트는 트랙 전체 길이(scaleMeters) 기준. */
export type TrackSegment = {
  id: string;
  status: 'approved' | 'pending';
  meters: number;
  date: string;
  startPct: number;
  widthPct: number;
};

export type TrackLane = {
  segments: TrackSegment[];
  /** 승인 합계 지점 — 러너(프로필)가 서는 위치 */
  approvedPct: number;
  /** 승인 + 대기 합계 지점 */
  endPct: number;
  /** 승인 거리가 목표를 넘긴 양(m) */
  overMeters: number;
};

export type Track = {
  /** 트랙 100%에 해당하는 거리. 기본은 목표, 누군가 목표를 넘기면 그 사람의 합계까지 늘린다. */
  scaleMeters: number;
  /** 골 깃발 위치(%) */
  goalPct: number;
  lanes: Map<string, TrackLane>;
};

type MemberLike = { userId: string; days: DayCell[] };

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * 그룹 목표를 트랙 전체 길이로 두고 멤버별 기록 조각의 위치를 계산한다.
 * 승인 기록을 날짜순으로 먼저 깔고, 승인 대기 기록을 그 뒤에 이어 붙인다.
 * 반려·만료 기록은 트랙에 올리지 않는다.
 */
export function buildTrack(members: MemberLike[], targetMeters: number): Track {
  const flat = members.map((m) => {
    const all = m.days.flatMap((d) => d.records.map((r) => ({ ...r, date: d.date })));
    const approved = all.filter((r) => r.status === 'approved');
    const pending = all.filter((r) => r.status === 'pending');
    const approvedMeters = approved.reduce((s, r) => s + r.meters, 0);
    const pendingMeters = pending.reduce((s, r) => s + r.meters, 0);
    return { userId: m.userId, ordered: [...approved, ...pending], approvedMeters, pendingMeters };
  });

  const longest = flat.reduce((max, m) => Math.max(max, m.approvedMeters + m.pendingMeters), 0);
  const scaleMeters = Math.max(targetMeters, longest, 1);
  const pct = (meters: number) => round((meters / scaleMeters) * 100);

  const lanes = new Map<string, TrackLane>();
  for (const m of flat) {
    let cursor = 0;
    const segments: TrackSegment[] = m.ordered.map((r) => {
      const startPct = pct(cursor);
      cursor += r.meters;
      return { id: r.id, status: r.status as 'approved' | 'pending', meters: r.meters, date: r.date, startPct, widthPct: round(pct(cursor) - startPct) };
    });
    lanes.set(m.userId, {
      segments,
      approvedPct: pct(m.approvedMeters),
      endPct: pct(m.approvedMeters + m.pendingMeters),
      overMeters: Math.max(0, m.approvedMeters - targetMeters),
    });
  }

  return { scaleMeters, goalPct: pct(targetMeters), lanes };
}
