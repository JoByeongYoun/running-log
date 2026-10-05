import { RUNNER_TYPE_LABEL, RUNNER_TYPE_SHORT, type RunnerType } from '@/lib/domain/runner-type';

/**
 * 아바타 오른쪽 아래에 붙는 스티커 뱃지.
 *  - 열정: 노란 폭발형 + 빨간 테두리, 빨간 "열정"
 *  - 자유: 하늘색 둥근 네모 + 남색 테두리, 남색 "자유"
 *  - 부상: 초록 원 + 흰 테두리, 흰 십자
 */
export function RunnerBadge({ type, size = 28, className = '' }: { type: RunnerType; size?: number; className?: string }) {
  const label = RUNNER_TYPE_LABEL[type];
  const text = RUNNER_TYPE_SHORT[type];
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
          <polygon points={BURST} fill="#FACC15" stroke="#DC2626" strokeWidth="2.2" strokeLinejoin="round" />
          <text x="20" y="24" textAnchor="middle" fontSize="12" fontWeight="800" fill="#DC2626" style={{ fontFamily: 'inherit' }}>{text}</text>
        </>
      )}
      {type === 'free' && (
        <>
          <rect x="4" y="6" width="32" height="28" rx="12" fill="#38BDF8" stroke="#1E3A8A" strokeWidth="2.2" transform="rotate(-8 20 20)" />
          <text x="20" y="24" textAnchor="middle" fontSize="12" fontWeight="800" fill="#1E3A8A" style={{ fontFamily: 'inherit' }}>{text}</text>
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

/** 12각 폭발형(중심 20,20 / 바깥 반지름 19, 안쪽 14) */
const BURST = Array.from({ length: 24 }, (_, i) => {
  const r = i % 2 === 0 ? 19 : 14;
  const a = (Math.PI / 12) * i - Math.PI / 2;
  return `${(20 + r * Math.cos(a)).toFixed(2)},${(20 + r * Math.sin(a)).toFixed(2)}`;
}).join(' ');
