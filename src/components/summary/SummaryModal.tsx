'use client';
import { useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { SummaryCard, PAGE_SIZE } from './SummaryCard';
import type { WeekSummary } from '@/lib/dashboard/types';

export function SummaryModal({ summary, open, onClose }: { summary: WeekSummary; open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const pageCount = Math.max(1, Math.ceil(summary.members.length / PAGE_SIZE));

  async function save() {
    if (!ref.current) return;
    setSaving(true);
    try {
      const dataUrl = await toPng(ref.current, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true });
      const name = `running-log-${summary.week.weekStart}${pageCount > 1 ? `-${page + 1}` : ''}.png`;
      const a = document.createElement('a');
      a.href = dataUrl; a.download = name; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
      toast('이미지를 저장했습니다. 저장이 보이지 않으면 새 탭의 이미지를 길게 눌러 저장하세요.');
      const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent);
      if (isIOS) window.open(dataUrl, '_blank');
    } catch {
      toast('이미지 저장에 실패했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="주간 요약">
      <SummaryCard ref={ref} summary={summary} page={page} pageCount={pageCount} />
      {pageCount > 1 && (
        <div className="mt-2 flex items-center justify-center gap-3 text-sm">
          <Button variant="ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>이전</Button>
          <span>{page + 1} / {pageCount}</span>
          <Button variant="ghost" disabled={page === pageCount - 1} onClick={() => setPage((p) => p + 1)}>다음</Button>
        </div>
      )}
      <div className="mt-4 flex gap-2">
        <Button variant="secondary" full onClick={onClose}>닫기</Button>
        <Button full loading={saving} onClick={save}>이미지 저장{pageCount > 1 ? ` (${page + 1}/${pageCount})` : ''}</Button>
      </div>
    </Modal>
  );
}
