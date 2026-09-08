'use client';
import { useEffect, useRef, type ReactNode } from 'react';

type Props = { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean };

export function Modal({ open, onClose, title, children, wide }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      aria-label={title}
      className={`m-auto w-[calc(100%-2rem)] rounded-2xl p-0 shadow-xl backdrop:bg-black/50 ${wide ? 'max-w-2xl' : 'max-w-md'}`}
    >
      <div className="max-h-[85dvh] overflow-y-auto p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="min-h-11 min-w-11 rounded-full text-xl text-slate-500 hover:bg-slate-100">×</button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
