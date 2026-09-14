'use client';

import { useState } from 'react';

type Props = { src: string | null; name: string; size?: number; /** 휴식 중: 흐리게 + 💤 배지 */ resting?: boolean };

export function Avatar({ src, name, size = 36, resting = false }: Props) {
  const initial = name.trim().slice(0, 1) || '?';
  // 로드에 실패한 URL을 기억한다. 새 서명 URL이 오면 자동으로 다시 시도된다.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const label = `${name} 프로필${resting ? ' · 휴식 중' : ''}`;
  const dim = resting ? 'opacity-60 grayscale' : '';
  const image = src && src !== failedSrc ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={label} width={size} height={size} onError={() => setFailedSrc(src)} className={`shrink-0 rounded-full object-cover ${dim}`} style={{ width: size, height: size }} />
  ) : (
    <div aria-label={label} className={`flex shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600 ${dim}`} style={{ width: size, height: size }}>{initial}</div>
  );
  if (!resting) return image;
  const badge = Math.max(12, Math.round(size * 0.42));
  return (
    <span className="relative inline-block shrink-0 align-middle" style={{ width: size, height: size }}>
      {image}
      <span
        aria-hidden
        className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full bg-sky-100 leading-none ring-1 ring-white"
        style={{ width: badge, height: badge, fontSize: Math.round(badge * 0.62) }}
      >💤</span>
    </span>
  );
}
