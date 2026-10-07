/** 러너 유형. 방장만 바꿀 수 있고 주간 평가 규칙을 결정한다. */
export type RunnerType = 'passion' | 'free' | 'injured';

export const RUNNER_TYPES: readonly RunnerType[] = ['passion', 'free', 'injured'];

export const RUNNER_TYPE_LABEL: Record<RunnerType, string> = { passion: '열정러너', free: '자유러너', injured: '부상러너' };
/** 뱃지 안에 들어가는 두 글자 */
export const RUNNER_TYPE_SHORT: Record<RunnerType, string> = { passion: '열정', free: '자유', injured: '부상' };
export const RUNNER_TYPE_DESC: Record<RunnerType, string> = {
  passion: '주간 목표 거리를 채우고 순위 내기에 참여합니다. 미달 1km마다 벌금.',
  free: '순위 내기 없이 주간 최소 거리만 채웁니다. 미달 1km마다 벌금.',
  injured: '평가·순위·벌금에서 제외됩니다. 기록 등록은 할 수 있습니다.',
};

export function isRunnerType(v: unknown): v is RunnerType {
  return typeof v === 'string' && (RUNNER_TYPES as readonly string[]).includes(v);
}
