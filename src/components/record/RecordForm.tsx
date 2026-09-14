'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { submitRecord } from '@/actions/record';
import { Input, Textarea } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { FormMessage } from '@/components/ui/FormMessage';
import { useToast } from '@/components/ui/Toast';
import { PhotoPicker } from './PhotoPicker';
import { usePhotoUploads } from './usePhotoUploads';
import { addDays, earliestSelectableDate, kstDateOf } from '@/lib/domain/week';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

/** 이번 주 월요일부터 오늘까지의 날짜 목록 (오늘이 마지막). 월요일에는 지난주 월~일도 포함한다 */
export function selectableDates(today: string, now: Date = new Date()): string[] {
  const start = earliestSelectableDate(today, now);
  const out: string[] = [];
  for (let d = start; d <= today; d = addDays(d, 1)) out.push(d);
  return out;
}

function labelOf(ymd: string, today: string): string {
  const [, m, d] = ymd.split('-');
  const dow = DOW[new Date(`${ymd}T00:00:00Z`).getUTCDay()];
  return `${Number(m)}월 ${Number(d)}일 (${dow})${ymd === today ? ' · 오늘' : ''}`;
}

export function RecordForm({ today, notice, disabledReason }: { today: string; notice?: string | null; disabledReason?: string }) {
  const [submissionKey, setSubmissionKey] = useState(() => crypto.randomUUID());
  const [distance, setDistance] = useState('');
  const [memo, setMemo] = useState('');
  const [activityDate, setActivityDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { photos, setPhotos, add, remove, move, retry, allReady } = usePhotoUploads();
  const router = useRouter();
  const toast = useToast();
  const dates = selectableDates(today);
  const includesLastWeek = dates.length > 7;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (kstDateOf(new Date()) !== today) {
      setError('날짜가 바뀌었습니다. 화면을 새로고침한 뒤 다시 확인해 주세요.');
      return;
    }
    start(async () => {
      const res = await submitRecord({
        submissionKey, distance, memo, clientDate: today, activityDate,
        uploadIds: photos.map((p) => p.uploadId).filter((x): x is string => Boolean(x)),
      });
      if (res.error) {
        if (res.code === 'date_changed') router.refresh();
        setError(res.error);
        return;
      }
      toast('기록을 등록했습니다. 관리자 승인을 기다려 주세요.');
      setSubmissionKey(crypto.randomUUID());
      setDistance(''); setMemo(''); setPhotos([]); setActivityDate(today);
      router.push('/');
    });
  }

  if (disabledReason) return <p className="rounded-xl bg-slate-100 px-3 py-3 text-sm text-slate-600">{disabledReason}</p>;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {notice && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="note" aria-label="공지사항">
          <p className="mb-0.5 text-xs font-semibold text-amber-700">📢 관리자 공지</p>
          <p className="whitespace-pre-wrap">{notice}</p>
        </div>
      )}
      <div className="space-y-1">
        <label htmlFor="activity-date" className="block text-sm font-medium text-slate-700">기록 날짜</label>
        <select
          id="activity-date" value={activityDate} onChange={(e) => setActivityDate(e.target.value)}
          className="block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base focus:outline-none focus:ring-2 focus:ring-slate-500"
        >
          {dates.map((d) => <option key={d} value={d}>{labelOf(d, today)}</option>)}
        </select>
        <p className="text-xs text-slate-500">{includesLastWeek ? '지난주 기록은 오늘(월요일)까지 올릴 수 있습니다.' : '이번 주 월요일부터 오늘까지 선택할 수 있습니다.'}</p>
      </div>
      <Input label="거리 (km)" value={distance} onChange={(e) => setDistance(e.target.value)} inputMode="decimal" placeholder="예: 5.25" required hint="0.01 ~ 500km, 소수 둘째 자리까지" />
      <PhotoPicker photos={photos} onAdd={add} onRemove={remove} onMove={move} onRetry={retry} disabled={pending} />
      <Textarea label="메모 (선택)" value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={1000} rows={2} />
      <FormMessage error={error} />
      <Button type="submit" full loading={pending} disabled={!allReady || !distance}>{activityDate === today ? '오늘 기록 제출' : '기록 제출'}</Button>
    </form>
  );
}
