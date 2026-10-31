'use client';
import { useEffect, useRef, useState } from 'react';
import { claimSummaryAutoShow } from '@/actions/summary';
import { kstDateOf } from '@/lib/domain/week';
import { SummaryModal } from './SummaryModal';
import type { WeekSummary } from '@/lib/dashboard/types';

const CHECK_KEY = 'summary-auto-show-checked';
/** 같은 날에는 이 간격 안에서 서버에 다시 묻지 않는다. 탭 전환마다 서버 액션이 호출되는 것을 막는다. */
const RECHECK_MS = 60 * 60 * 1000;

function recentlyChecked(today: string): boolean {
  try {
    const raw = localStorage.getItem(CHECK_KEY);
    if (!raw) return false;
    const [date, ts] = raw.split('|');
    return date === today && Date.now() - Number(ts) < RECHECK_MS;
  } catch { return false; }
}
function markChecked(today: string) {
  try { localStorage.setItem(CHECK_KEY, `${today}|${Date.now()}`); } catch { /* ignore */ }
}

/** 주간 전환 후 앱을 활성 이용할 때 최대 1회 자동 표시 */
export function SummaryAutoShow() {
  const [summary, setSummary] = useState<WeekSummary | null>(null);
  const [open, setOpen] = useState(false);
  const busy = useRef(false);
  const lastDate = useRef(kstDateOf(new Date()));

  useEffect(() => {
    async function check(force = false) {
      if (busy.current || document.visibilityState !== 'visible') return;
      const today = kstDateOf(new Date());
      if (!force && recentlyChecked(today)) return;
      busy.current = true;
      try {
        const s = await claimSummaryAutoShow();
        markChecked(today);
        if (s) { setSummary(s); setOpen(true); }
      } finally { busy.current = false; }
    }
    void check();
    const onVis = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', onVis);
    const timer = setInterval(() => {
      const today = kstDateOf(new Date());
      if (today !== lastDate.current) { lastDate.current = today; void check(true); }
    }, 60_000);
    return () => { document.removeEventListener('visibilitychange', onVis); clearInterval(timer); };
  }, []);

  if (!summary) return null;
  return <SummaryModal summary={summary} open={open} onClose={() => setOpen(false)} />;
}
