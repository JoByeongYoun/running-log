import { useId } from 'react';
import { RUNNER_TYPE_LABEL } from '@/lib/domain/runner-type';

const RAYS = 12;
/** 아바타 지름 대비 테두리 SVG 크기 배율. 광선이 아바타 밖으로 25% 씩 나간다. */
export const SUN_RING_SCALE = 1.5;

/**
 * 열정러너 전용: 아바타 둘레에 태양을 연상시키는 테두리.
 * 아바타(지름 size) 뒤에 깔리며, 부드러운 주황 글로우 + 12개 광선 + 금→주황→빨강 그라데이션 링.
 * 부모는 `relative` 여야 하고 아바타는 그 위(z-index 1)에 놓인다.
 */
export function SunRing({ size }: { size: number }) {
  const uid = useId().replace(/:/g, '');
  const box = Math.round(size * SUN_RING_SCALE);
  const rays = Array.from({ length: RAYS }, (_, i) => {
    const a = (i / RAYS) * 2 * Math.PI - Math.PI / 2;
    const long = i % 2 === 0;
    const r0 = 36, r1 = long ? 49 : 44, w = long ? 0.16 : 0.12;
    const p = (r: number, da: number) => `${(50 + r * Math.cos(a + da)).toFixed(2)},${(50 + r * Math.sin(a + da)).toFixed(2)}`;
    return <polygon key={i} data-part="sun-ray" points={`${p(r0, -w)} ${p(r1, 0)} ${p(r0, w)}`} fill={`url(#${uid}-ray)`} stroke="#9A3412" strokeWidth="0.8" strokeLinejoin="round" />;
  });
  return (
    <svg
      role="img"
      aria-label={RUNNER_TYPE_LABEL.passion}
      data-part="sun-ring"
      width={box}
      height={box}
      viewBox="0 0 100 100"
      className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
      style={{ zIndex: 0 }}
    >
      <defs>
        <linearGradient id={`${uid}-ray`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#F97316" />
          <stop offset="100%" stopColor="#FDE047" />
        </linearGradient>
        <linearGradient id={`${uid}-ring`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FDE047" />
          <stop offset="50%" stopColor="#F97316" />
          <stop offset="100%" stopColor="#DC2626" />
        </linearGradient>
        <filter id={`${uid}-glow`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      <circle cx="50" cy="50" r="45" fill="#FB923C" opacity="0.45" filter={`url(#${uid}-glow)`} />
      <g>{rays}</g>
      <circle cx="50" cy="50" r="36.5" fill="none" stroke={`url(#${uid}-ring)`} strokeWidth="4" />
      <circle cx="50" cy="50" r="33.8" fill="none" stroke="#FFF7ED" strokeWidth="1.2" opacity="0.9" />
    </svg>
  );
}
