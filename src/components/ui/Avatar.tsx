'use client';

import { useState } from 'react';

export function Avatar({ src, name, size = 36 }: { src: string | null; name: string; size?: number }) {
  const initial = name.trim().slice(0, 1) || '?';
  // 로드에 실패한 URL을 기억한다. 새 서명 URL이 오면 자동으로 다시 시도된다.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return src && src !== failedSrc ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={`${name} 프로필`} width={size} height={size} onError={() => setFailedSrc(src)} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <div aria-label={`${name} 프로필`} className="flex shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600" style={{ width: size, height: size }}>{initial}</div>
  );
}
