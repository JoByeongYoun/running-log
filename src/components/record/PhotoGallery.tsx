'use client';
import { useState } from 'react';

export function PhotoGallery({ photos }: { photos: { id: string; url: string }[] }) {
  const [idx, setIdx] = useState<number | null>(null);
  if (photos.length === 0) return null;
  return (
    <section className="rounded-2xl border border-slate-200 p-3">
      <h2 className="mb-2 text-sm font-semibold">증거 사진 {photos.length}장</h2>
      <ul className="grid grid-cols-3 gap-2">
        {photos.map((p, i) => (
          <li key={p.id}>
            <button type="button" onClick={() => setIdx(i)} className="block w-full overflow-hidden rounded-xl" aria-label={`사진 ${i + 1} 확대`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={`증거 사진 ${i + 1}`} className="aspect-square w-full object-cover" loading="lazy" />
            </button>
          </li>
        ))}
      </ul>
      {idx !== null && (
        <div role="dialog" aria-modal="true" aria-label="사진 확대" className="fixed inset-0 z-50 flex flex-col bg-black" onClick={() => setIdx(null)}>
          <div className="flex items-center justify-between p-3 text-white">
            <span className="text-sm">{idx + 1} / {photos.length}</span>
            <button type="button" aria-label="닫기" className="min-h-11 min-w-11 text-2xl" onClick={() => setIdx(null)}>×</button>
          </div>
          <div className="flex flex-1 items-center justify-center overflow-auto" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photos[idx].url} alt={`증거 사진 ${idx + 1} 확대`} className="max-h-full max-w-full object-contain" />
          </div>
          <div className="flex justify-between p-3 text-white" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="min-h-11 px-4 disabled:opacity-30" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>‹ 이전</button>
            <button type="button" className="min-h-11 px-4 disabled:opacity-30" disabled={idx === photos.length - 1} onClick={() => setIdx(idx + 1)}>다음 ›</button>
          </div>
        </div>
      )}
    </section>
  );
}
