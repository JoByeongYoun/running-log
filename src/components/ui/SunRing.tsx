import { useId } from 'react';
import { RUNNER_TYPE_LABEL } from '@/lib/domain/runner-type';

/** 아바타 지름 대비 테두리 SVG 크기 배율. 불꽃이 아바타 밖으로 45% 씩 나간다. */
export const SUN_RING_SCALE = 1.9;

const R_BASE = 33;
const f = (v: number) => v.toFixed(1);

/**
 * 불꽃 혀 n개. 원(R_BASE) 위 두 점에서 바깥 tip 으로 휘어 오르는 곡선.
 * seed 로 높이·기울기를 흔들어 같은 모양이 반복되지 않게 한다.
 */
function flames(n: number, hMin: number, hMax: number, lean: number, seed: number): string[] {
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * 2 * Math.PI - Math.PI / 2 + seed;
    const h = hMin + (hMax - hMin) * (0.5 + 0.5 * Math.sin(i * 2.7 + seed * 9));
    const w = 0.09 + 0.03 * Math.cos(i * 1.9 + seed * 5);
    const L = lean * (0.10 + 0.06 * Math.sin(i * 1.3 + seed * 7));
    const P = (r: number, da: number) => [50 + r * Math.cos(t + da), 50 + r * Math.sin(t + da)] as const;
    const [ax, ay] = P(R_BASE, -w), [bx, by] = P(R_BASE, w), [tx, ty] = P(R_BASE + h, L);
    // 바깥쪽으로 갈수록 좁아지고 기울어져 끝이 뾰족한 혀 모양. 한쪽 변은 볼록, 반대쪽은 오목하게.
    const [c1x, c1y] = P(R_BASE + h * 0.35, -w * 1.9 + L * 0.2), [c2x, c2y] = P(R_BASE + h * 0.80, -w * 0.4 + L * 0.8);
    const [c3x, c3y] = P(R_BASE + h * 0.70, w * 0.3 + L * 0.9), [c4x, c4y] = P(R_BASE + h * 0.30, w * 1.3 + L * 0.1);
    return `M${f(ax)} ${f(ay)} C${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(tx)} ${f(ty)} C${f(c3x)} ${f(c3y)} ${f(c4x)} ${f(c4y)} ${f(bx)} ${f(by)}Z`;
  });
}

const OUTER = flames(12, 16, 25, 1, 0.0);
const MID = flames(14, 10, 17, -1, 0.25);
const INNER = flames(10, 5, 10, 1, 0.6);

/**
 * 열정러너 전용: 아바타 둘레에 활활 타오르는 불꽃 테두리.
 * 아바타(지름 size) 뒤에 깔린다. 바깥 빨강·가운데 주황·안쪽 노랑 세 겹 불꽃 + 글로우 + 그라데이션 링.
 * 겹마다 반대 방향으로 흔들리는 애니메이션(globals.css .sun-flame-a / -b / .sun-glow). 모션 줄이기 설정이면 정지.
 * 부모는 `relative` 여야 하고 아바타는 그 위(z-index 1)에 놓인다.
 */
export function SunRing({ size }: { size: number }) {
  const uid = useId().replace(/:/g, '');
  const box = Math.round(size * SUN_RING_SCALE);
  const layer = (paths: string[], fill: string, stroke: string, cls: string) => (
    <g className={cls}>
      {paths.map((d, i) => <path key={i} data-part="flame-tongue" d={d} fill={fill} stroke={stroke} strokeWidth="0.7" strokeLinejoin="round" />)}
    </g>
  );
  return (
    <svg
      role="img"
      aria-label={RUNNER_TYPE_LABEL.passion}
      data-part="sun-ring"
      width={box}
      height={box}
      viewBox="0 0 100 100"
      className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 overflow-visible"
      style={{ zIndex: 0 }}
    >
      <defs>
        <linearGradient id={`${uid}-out`} x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stopColor="#DC2626" /><stop offset="60%" stopColor="#F97316" /><stop offset="100%" stopColor="#FDBA74" /></linearGradient>
        <linearGradient id={`${uid}-mid`} x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stopColor="#F97316" /><stop offset="100%" stopColor="#FDE047" /></linearGradient>
        <linearGradient id={`${uid}-in`} x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stopColor="#FDE047" /><stop offset="100%" stopColor="#FFFBEB" /></linearGradient>
        <linearGradient id={`${uid}-ring`} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#FEF08A" /><stop offset="45%" stopColor="#F97316" /><stop offset="100%" stopColor="#B91C1C" /></linearGradient>
        <filter id={`${uid}-glow`} x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="4.5" /></filter>
      </defs>
      <circle className="sun-glow" cx="50" cy="50" r="46" fill="#F97316" opacity="0.7" filter={`url(#${uid}-glow)`} />
      {layer(OUTER, `url(#${uid}-out)`, '#7F1D1D', 'sun-flame-a')}
      {layer(MID, `url(#${uid}-mid)`, '#9A3412', 'sun-flame-b')}
      {layer(INNER, `url(#${uid}-in)`, 'none', 'sun-flame-a')}
      <circle cx="50" cy="50" r="33.5" fill="none" stroke={`url(#${uid}-ring)`} strokeWidth="4.5" />
      <circle cx="50" cy="50" r="30.8" fill="none" stroke="#FFF7ED" strokeWidth="1.2" opacity="0.95" />
    </svg>
  );
}
