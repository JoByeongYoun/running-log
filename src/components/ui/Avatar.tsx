'use client';

import { useState } from 'react';
import { RUNNER_TYPE_LABEL, type RunnerType } from '@/lib/domain/runner-type';
import { RunnerBadge } from './RunnerBadge';

type Props = { src: string | null; name: string; size?: number; /** 러너 유형 뱃지. 부상이면 흐리게. */ badge?: RunnerType | null };

export function Avatar({ src, name, size = 36, badge = null }: Props) {
  const initial = name.trim().slice(0, 1) || '?';
  // 로드에 실패한 URL을 기억한다. 새 서명 URL이 오면 자동으로 다시 시도된다.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const label = `${name} 프로필${badge ? ` · ${RUNNER_TYPE_LABEL[badge]}` : ''}`;
  const dim = badge === 'injured' ? 'opacity-60 grayscale' : '';
  const image = src && src !== failedSrc ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={label} width={size} height={size} onError={() => setFailedSrc(src)} className={`shrink-0 rounded-full object-cover ${dim}`} style={{ width: size, height: size }} />
  ) : (
    <div aria-label={label} className={`flex shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600 ${dim}`} style={{ width: size, height: size }}>{initial}</div>
  );
  if (!badge) return image;
  const badgeSize = Math.max(14, Math.round(size * 0.55));
  return (
    <span className="relative inline-block shrink-0 align-middle" style={{ width: size, height: size }}>
      {image}
      <RunnerBadge type={badge} size={badgeSize} className="absolute -bottom-1 -right-1.5" />
    </span>
  );
}
