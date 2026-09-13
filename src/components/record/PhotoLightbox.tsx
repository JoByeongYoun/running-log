'use client';
import { useEffect, useRef } from 'react';

type Props = { photos: { id: string; url: string }[]; index: number | null; onChange: (index: number | null) => void; label?: string };

/** Full-screen photo viewer. Uses a native <dialog> so it stacks correctly above other modals. */
export function PhotoLightbox({ photos, index, onChange, label = '증거 사진' }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const open = index !== null && index >= 0 && index < photos.length;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && index! > 0) onChange(index! - 1);
      if (e.key === 'ArrowRight' && index! < photos.length - 1) onChange(index! + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, index, photos.length, onChange]);

  // stopPropagation matters when nested inside another <dialog>: React bubbles
  // synthetic close/click events to ancestors, which would close the parent modal too.
  const close = () => onChange(null);
  const idx = open ? (index as number) : 0;

  return (
    <dialog
      ref={ref}
      onClose={(e) => { e.stopPropagation(); close(); }}
      onClick={(e) => { e.stopPropagation(); close(); }}
      aria-label="사진 확대"
      className="fixed inset-0 m-0 h-dvh w-screen max-h-none max-w-none bg-black p-0 text-white backdrop:bg-black"
    >
      {open && (
        <div className="flex h-full w-full flex-col">
          <div className="flex items-center justify-between p-3" onClick={(e) => e.stopPropagation()}>
            <span className="text-sm">{photos.length > 1 ? `${idx + 1} / ${photos.length}` : label}</span>
            <button type="button" aria-label="닫기" className="min-h-11 min-w-11 text-2xl" onClick={close}>×</button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photos[idx].url} alt={photos.length > 1 ? `${label} ${idx + 1} 확대` : `${label} 확대`} className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
          </div>
          {photos.length > 1 && (
            <div className="flex justify-between p-3" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="min-h-11 px-4 disabled:opacity-30" disabled={idx === 0} onClick={() => onChange(idx - 1)}>‹ 이전</button>
              <button type="button" className="min-h-11 px-4 disabled:opacity-30" disabled={idx === photos.length - 1} onClick={() => onChange(idx + 1)}>다음 ›</button>
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}
