'use client';
import { useEffect } from 'react';

/** 기록 상세에서 돌아올 때 스크롤 위치 복원 */
export function ScrollRestore({ storageKey }: { storageKey: string }) {
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) { window.scrollTo(0, Number(saved)); sessionStorage.removeItem(storageKey); }
    } catch { /* ignore */ }
    const save = () => { try { sessionStorage.setItem(storageKey, String(window.scrollY)); } catch { /* ignore */ } };
    document.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('a[href^="/records/"]');
      if (a) save();
    });
    return undefined;
  }, [storageKey]);
  return null;
}
