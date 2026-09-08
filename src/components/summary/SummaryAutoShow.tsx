'use client';
import { useEffect, useRef, useState } from 'react';
import { claimSummaryAutoShow } from '@/actions/summary';
import { kstDateOf } from '@/lib/domain/week';
import { SummaryModal } from './SummaryModal';
import type { WeekSummary } from '@/lib/dashboard/types';

/** 주간 전환 후 앱을 활성 이용할 때 최대 1회 자동 표시 */
export function SummaryAutoShow() {
  const [summary, setSummary] = useState<WeekSummary | null>(null);
  const [open, setOpen] = useState(false);
  const busy = useRef(false);
  const lastDate = useRef(kstDateOf(new Date()));

  useEffect(() => {
    async function check() {
      if (busy.current || document.visibilityState !== 'visible') return;
      busy.current = true;
      try {
        const s = await claimSummaryAutoShow();
        if (s) { setSummary(s); setOpen(true); }
      } finally { busy.current = false; }
    }
    void check();
    const onVis = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', onVis);
    const timer = setInterval(() => {
      const today = kstDateOf(new Date());
      if (today !== lastDate.current) { lastDate.current = today; void check(); }
    }, 60_000);
    return () => { document.removeEventListener('visibilitychange', onVis); clearInterval(timer); };
  }, []);

  if (!summary) return null;
  return <SummaryModal summary={summary} open={open} onClose={() => setOpen(false)} />;
}
