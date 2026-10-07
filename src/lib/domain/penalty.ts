import type { RunnerType } from './runner-type';

export type EvalSettings = { targetMeters: number; freeMinMeters: number; penaltyPerKmWon: number; zeroKmPenaltyWon: number };
export type Evaluation = { outcome: 'success' | 'fail' | 'not_evaluated'; penaltyWon: number; ranked: boolean; goalMeters: number | null };

/** 유형별 목표 거리(m). 부상은 목표 없음. */
export function goalFor(type: RunnerType, s: Pick<EvalSettings, 'targetMeters' | 'freeMinMeters'>): number | null {
  if (type === 'injured') return null;
  return type === 'free' ? s.freeMinMeters : s.targetMeters;
}

/**
 * 주간 판정·벌금. DB의 app.evaluate 와 반드시 같은 결과를 내야 한다 (통합 테스트가 교차 검증).
 * - 목표 이상: 성공, 0원
 * - 0m: 고정 0km 벌금 (km당 계산을 대체)
 * - 그 외: 미달분을 1km 단위로 올림 × km당 벌금
 */
export function evaluate(type: RunnerType, totalMeters: number, s: EvalSettings): Evaluation {
  const goalMeters = goalFor(type, s);
  const ranked = type === 'passion';
  if (goalMeters === null) return { outcome: 'not_evaluated', penaltyWon: 0, ranked, goalMeters };
  if (totalMeters >= goalMeters) return { outcome: 'success', penaltyWon: 0, ranked, goalMeters };
  if (totalMeters <= 0) return { outcome: 'fail', penaltyWon: s.zeroKmPenaltyWon, ranked, goalMeters };
  const shortKm = Math.ceil((goalMeters - totalMeters) / 1000);
  return { outcome: 'fail', penaltyWon: shortKm * s.penaltyPerKmWon, ranked, goalMeters };
}

export function formatWon(won: number): string {
  return `${Math.round(won).toLocaleString('ko-KR')}원`;
}
