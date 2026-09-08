'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
const KEY = 'install-dismissed';

export function InstallPrompt() {
  const [bip, setBip] = useState<BIPEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    let dismissed = false;
    try { dismissed = localStorage.getItem(KEY) === '1'; } catch { /* ignore */ }
    if (standalone || dismissed) return;
    const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) && !/CriOS|FxiOS/.test(navigator.userAgent);
    const t = isIOS ? setTimeout(() => { setIos(true); setHidden(false); }, 1500) : undefined;
    const handler = (e: Event) => { e.preventDefault(); setBip(e as BIPEvent); setHidden(false); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => { window.removeEventListener('beforeinstallprompt', handler); if (t) clearTimeout(t); };
  }, []);

  function dismiss() { setHidden(true); try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ } }
  if (hidden) return null;
  return (
    <div className="fixed inset-x-3 bottom-3 z-40 rounded-2xl border border-slate-200 bg-white p-3 text-sm shadow-lg">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="font-medium">홈 화면에 추가하면 앱처럼 쓸 수 있어요</p>
          {ios && <p className="mt-1 text-xs text-slate-600">Safari 하단 <b>공유</b> 버튼 → <b>홈 화면에 추가</b>를 선택하세요.</p>}
        </div>
        <button type="button" aria-label="닫기" onClick={dismiss} className="min-h-11 min-w-11 text-xl text-slate-400">×</button>
      </div>
      {bip && (
        <Button className="mt-2" full onClick={async () => { await bip.prompt(); const c = await bip.userChoice; if (c.outcome === 'accepted') setHidden(true); else dismiss(); }}>설치</Button>
      )}
    </div>
  );
}
