import { useId } from 'react';
import { RUNNER_TYPE_LABEL, RUNNER_TYPE_SHORT, type RunnerType } from '@/lib/domain/runner-type';

/**
 * 아바타 오른쪽 아래에 붙는 스티커 뱃지.
 *  - 열정: 빨강→주황→노랑 그라데이션 16각 폭발 + 안쪽 노란 폭발 + 흰 불꽃. 글자 없음.
 *  - 자유: 밋밋한 단색 원 + 회색 "자유".
 *  - 부상: 초록 원 + 흰 테두리, 흰 십자.
 */
export function RunnerBadge({ type, size = 28, className = '' }: { type: RunnerType; size?: number; className?: string }) {
  const label = RUNNER_TYPE_LABEL[type];
  const text = RUNNER_TYPE_SHORT[type];
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
            <radialGradient id={`${uid}-burst`} cx="50%" cy="45%" r="60%">
              <stop offset="0%" stopColor="#FDE047" />
              <stop offset="55%" stopColor="#F97316" />
              <stop offset="100%" stopColor="#DC2626" />
            </radialGradient>
            <linearGradient id={`${uid}-flame`} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#FFF7ED" />
              <stop offset="100%" stopColor="#FEF08A" />
            </linearGradient>
          </defs>
          {/* 바깥 16각 폭발: 그라데이션 + 진한 테두리 */}
          <polygon points={BURST_OUTER} fill={`url(#${uid}-burst)`} stroke="#7F1D1D" strokeWidth="1.6" strokeLinejoin="round" />
          {/* 안쪽 8각 폭발: 밝은 노랑으로 겹쳐 입체감 */}
          <polygon points={BURST_INNER} fill="#FACC15" opacity="0.9" />
          {/* 불꽃 */}
          <path
            data-part="flame"
            d="M20 9.5c1.2 3.2 4.6 5 4.6 9.4 0 1.5-.5 2.8-1.3 3.8.1-2.1-.9-3.6-2.1-4.6.3 2.6-1.6 3.6-1.6 6 0 1 .4 1.9 1 2.5-3.2-.5-5.5-3-5.5-6.3 0-4.8 4.5-6.3 4.9-10.8z"
            fill={`url(#${uid}-flame)`}
            stroke="#B91C1C"
            strokeWidth="0.9"
            strokeLinejoin="round"
          />
          {/* 반짝임 */}
          <path d="M31 8l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" fill="#FFFFFF" opacity="0.95" />
          <circle cx="9.5" cy="12" r="1.1" fill="#FFFFFF" opacity="0.85" />
        </>
      )}
      {type === 'free' && (
        <>
          <circle cx="20" cy="20" r="16" fill="#E2E8F0" stroke="#94A3B8" strokeWidth="1.5" />
          <text x="20" y="24" textAnchor="middle" fontSize="12" fontWeight="600" fill="#475569" style={{ fontFamily: 'inherit' }}>{text}</text>
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

function burst(points: number, outer: number, inner: number): string {
  return Array.from({ length: points * 2 }, (_, i) => {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / points) * i - Math.PI / 2;
    return `${(20 + r * Math.cos(a)).toFixed(2)},${(20 + r * Math.sin(a)).toFixed(2)}`;
  }).join(' ');
}

/** 바깥 16각 폭발(반지름 19.5 / 14.5), 안쪽 8각 폭발(13 / 9.5) */
const BURST_OUTER = burst(16, 19.5, 14.5);
const BURST_INNER = burst(8, 13, 9.5);
