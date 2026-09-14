'use client';
import { useEffect, useRef, type ReactNode } from 'react';

type Props = { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean; bare?: boolean };

export function Modal({ open, onClose, title, children, wide, bare }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
    if (!open) return;
    // margin:auto 센터링은 소수점 좌표(예: top 529.75px)에 떨어지기 쉽고,
    // iOS WebKit은 그 위의 스크롤 레이어를 반 픽셀 어긋난 채 합성해 글자가 흐려진다.
    // 열릴 때(그리고 크기가 바뀔 때) 위치를 정수 픽셀로 스냅한다.
    const snap = () => {
      el.style.marginTop = el.style.marginLeft = el.style.marginBottom = el.style.marginRight = '';
      const r = el.getBoundingClientRect();
      el.style.marginTop = `${Math.round(r.top)}px`;
      el.style.marginLeft = `${Math.round(r.left)}px`;
      el.style.marginBottom = el.style.marginRight = '0';
    };
    snap();
    const ro = new ResizeObserver(snap);
    ro.observe(el);
    window.addEventListener('resize', snap);
    return () => { ro.disconnect(); window.removeEventListener('resize', snap); };
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      aria-label={title}
      className={`m-auto w-[calc(100%-2rem)] rounded-2xl p-0 shadow-xl backdrop:bg-black/50 ${wide ? 'max-w-2xl' : 'max-w-md'}`}
    >
      <div className={`max-h-[85dvh] overflow-y-auto ${bare ? '' : 'p-5'}`}>
        {!bare && (
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button type="button" onClick={onClose} aria-label="닫기" className="min-h-11 min-w-11 rounded-full text-xl text-slate-500 hover:bg-slate-100">×</button>
          </div>
        )}
        {children}
      </div>
    </dialog>
  );
}
