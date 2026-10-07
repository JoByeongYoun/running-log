import { useId } from 'react';
import { RUNNER_TYPE_LABEL, type RunnerType } from '@/lib/domain/runner-type';

/**
 * 아바타 오른쪽 아래에 붙는 스티커 뱃지.
 *  - 열정: 주황 글로우 + 빨강→주황→노랑 14각 폭발 + 노란 안쪽 폭발 + 반짝임. 글자·불꽃 없음.
 *  - 자유: 하늘색 구름. 글자 없음.
 *  - 부상: 초록 원 + 흰 테두리, 흰 십자.
 */
export function RunnerBadge({ type, size = 28, className = '' }: { type: RunnerType; size?: number; className?: string }) {
  const label = RUNNER_TYPE_LABEL[type];

  const uid = useId().replace(/:/g, '');
  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox="0 0 40 40"
      className={`shrink-0 drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)] ${className}`}
    >
      {type === 'passion' && (
        <>
          <defs>
            <radialGradient id={`${uid}-b`} cx="50%" cy="60%" r="60%">
              <stop offset="0%" stopColor="#FDE047" /><stop offset="45%" stopColor="#F97316" /><stop offset="100%" stopColor="#B91C1C" />
            </radialGradient>
            <filter id={`${uid}-g`} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.6" /></filter>
          </defs>
          <circle cx="20" cy="20" r="18" fill="#F97316" opacity="0.55" filter={`url(#${uid}-g)`} />
          <polygon data-part="burst" points={BURST_OUTER} fill={`url(#${uid}-b)`} stroke="#7F1D1D" strokeWidth="1.5" strokeLinejoin="round" />
          <polygon points={BURST_INNER} fill="#FDE047" opacity="0.85" />
          {/* 반짝임 */}
          <path d="M31.5 7.5l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z" fill="#FFFFFF" />
          <path d="M8 9.5l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5z" fill="#FFFFFF" opacity="0.9" />
          <circle cx="30" cy="30" r="1" fill="#FFF7ED" opacity="0.9" />
        </>
      )}
      {type === 'free' && (
        <>
          <defs>
            <linearGradient id={`${uid}-c`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FFFFFF" /><stop offset="100%" stopColor="#DBEAFE" />
            </linearGradient>
          </defs>
          <path
            data-part="cloud"
            d="M11 31.5c-3.6 0-6.5-2.7-6.5-6.1 0-3 2.2-5.5 5.1-6-.1-.4-.1-.8-.1-1.2 0-4 3.3-7.2 7.4-7.2 2.9 0 5.4 1.6 6.6 4 .8-.4 1.7-.6 2.7-.6 3.4 0 6.2 2.7 6.2 6 0 .3 0 .6-.1.9 2.1.6 3.7 2.5 3.7 4.8 0 2.9-2.4 5.4-5.5 5.4z"
            fill={`url(#${uid}-c)`} stroke="#93C5FD" strokeWidth="1.4" strokeLinejoin="round"
          />
        </>
      )}
      {type === 'injured' && (
        <>
          <circle cx="20" cy="20" r="16" fill="#22C55E" stroke="#FFFFFF" strokeWidth="2.5" />
          <rect x="17" y="10" width="6" height="20" rx="1.5" fill="#FFFFFF" />
          <rect x="10" y="17" width="20" height="6" rx="1.5" fill="#FFFFFF" />
        </>
      )}
    </svg>
  );
}

function burst(points: number, outer: number, inner: number, rot = 0): string {
  return Array.from({ length: points * 2 }, (_, i) => {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / points) * i - Math.PI / 2 + rot;
    return `${(20 + r * Math.cos(a)).toFixed(2)},${(20 + r * Math.sin(a)).toFixed(2)}`;
  }).join(' ');
}

/** 바깥 14각 폭발(살짝 기울임), 안쪽 7각 폭발(반대로 기울임) */
const BURST_OUTER = burst(14, 19.6, 14.2, 0.12);
const BURST_INNER = burst(7, 14.5, 10.5, -0.2);
