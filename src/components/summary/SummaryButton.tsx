'use client';
import { useState, useTransition } from 'react';
import { getWeekSummary } from '@/actions/summary';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { SummaryModal } from './SummaryModal';
import type { WeekSummary } from '@/lib/dashboard/types';

export function SummaryButton({ groupId, weekStart }: { groupId: string; weekStart: string }) {
  const [summary, setSummary] = useState<WeekSummary | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <>
      <Button variant="secondary" loading={pending} onClick={() => start(async () => {
        const s = await getWeekSummary(groupId, weekStart);
        if (!s) { toast('요약을 불러오지 못했습니다.', 'error'); return; }
        setSummary(s); setOpen(true);
      })}>주간 요약 보기</Button>
      {summary && <SummaryModal summary={summary} open={open} onClose={() => setOpen(false)} />}
    </>
  );
}
