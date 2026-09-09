'use client';
import { useState } from 'react';
import { PhotoLightbox } from './PhotoLightbox';

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
      <PhotoLightbox photos={photos} index={idx} onChange={setIdx} />
    </section>
  );
}
