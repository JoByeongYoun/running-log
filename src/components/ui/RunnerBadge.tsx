import { useId } from 'react';
import { RUNNER_TYPE_LABEL, type RunnerType } from '@/lib/domain/runner-type';

/**
 * 아바타 오른쪽 아래에 붙는 스티커 뱃지.
 *  - 열정: 주황 글로우 + 빨강→주황→노랑 14각 폭발 + 노란 안쪽 폭발 + 세 겹 불꽃(빨강·주황·흰 심지) + 반짝임. 글자 없음.
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
            <linearGradient id={`${uid}-f1`} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#DC2626" /><stop offset="55%" stopColor="#F97316" /><stop offset="100%" stopColor="#FACC15" />
            </linearGradient>
            <linearGradient id={`${uid}-f2`} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#FB923C" /><stop offset="100%" stopColor="#FEF08A" />
            </linearGradient>
            <linearGradient id={`${uid}-f3`} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#FEF3C7" /><stop offset="100%" stopColor="#FFFFFF" />
            </linearGradient>
            <filter id={`${uid}-g`} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.6" /></filter>
          </defs>
          <circle cx="20" cy="20" r="18" fill="#F97316" opacity="0.55" filter={`url(#${uid}-g)`} />
          <polygon points={BURST_OUTER} fill={`url(#${uid}-b)`} stroke="#7F1D1D" strokeWidth="1.5" strokeLinejoin="round" />
          <polygon points={BURST_INNER} fill="#FDE047" opacity="0.85" />
          {/* 큰 불꽃 몸통 */}
          <path
            data-part="flame"
            d="M20 6.5c.6 3.4 3.6 4.6 5.6 7.4 2.3 3.1 2.2 7.1-.3 9.9-.1-2.3-1-4-2.6-5.2.6 3.2-.9 5-2.1 7-.6 1-.8 2.1-.5 3.3-3.6-.6-6.3-3.3-6.8-6.9-.5-3.8 1.5-6.4 3.6-8.6 1.6-1.8 2.9-3.9 3.1-6.9z"
            fill={`url(#${uid}-f1)`} stroke="#7F1D1D" strokeWidth="0.9" strokeLinejoin="round"
          />
          {/* 안쪽 불꽃 */}
          <path d="M20.4 15.2c.3 2 2 2.9 2.9 4.6 1 1.9.7 4.1-.7 5.6-.1-1.4-.6-2.4-1.5-3.1.2 1.9-.7 3-1.4 4.1-.3.5-.4 1.1-.3 1.6-2-.5-3.4-2.2-3.5-4.3-.1-2.2 1.2-3.6 2.4-4.9.9-1 1.7-2.2 2.1-3.6z" fill={`url(#${uid}-f2)`} />
          {/* 흰 심지 */}
          <path d="M20.6 21.2c.2 1 .9 1.5 1.3 2.4.4 1 .2 2.1-.5 2.8 0-.7-.3-1.2-.7-1.6.1 1-.4 1.5-.8 2.1-.1.2-.2.5-.2.8-1-.3-1.7-1.2-1.7-2.2 0-1.1.7-1.8 1.3-2.5.5-.5.9-1.1 1.3-1.8z" fill={`url(#${uid}-f3)`} />
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
