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
import { kstDateOf } from '@/lib/domain/week';

export function RecordForm({ today, disabledReason }: { today: string; disabledReason?: string }) {
  const [submissionKey, setSubmissionKey] = useState(() => crypto.randomUUID());
  const [distance, setDistance] = useState('');
  const [memo, setMemo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { photos, setPhotos, add, remove, move, retry, allReady } = usePhotoUploads();
  const router = useRouter();
  const toast = useToast();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (kstDateOf(new Date()) !== today) {
      setError('날짜가 바뀌었습니다. 화면을 새로고침한 뒤 오늘 날짜로 다시 확인해 주세요.');
      return;
    }
    start(async () => {
      const res = await submitRecord({
        submissionKey, distance, memo, clientDate: today,
        uploadIds: photos.map((p) => p.uploadId).filter((x): x is string => Boolean(x)),
      });
      if (res.error) {
        if (res.code === 'date_changed') router.refresh();
        setError(res.error);
        return;
      }
      toast('기록을 등록했습니다. 관리자 승인을 기다려 주세요.');
      setSubmissionKey(crypto.randomUUID());
      setDistance(''); setMemo(''); setPhotos([]);
      router.refresh();
    });
  }

  if (disabledReason) return <p className="rounded-xl bg-slate-100 px-3 py-3 text-sm text-slate-600">{disabledReason}</p>;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
        <span className="text-slate-500">기록 날짜</span>
        <span className="font-medium">{today} (오늘)</span>
      </div>
      <Input label="거리 (km)" value={distance} onChange={(e) => setDistance(e.target.value)} inputMode="decimal" placeholder="예: 5.25" required hint="0.01 ~ 500km, 소수 둘째 자리까지" />
      <PhotoPicker photos={photos} onAdd={add} onRemove={remove} onMove={move} onRetry={retry} disabled={pending} />
      <Textarea label="메모 (선택)" value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={1000} rows={2} />
      <FormMessage error={error} />
      <Button type="submit" full loading={pending} disabled={!allReady || !distance}>오늘 기록 제출</Button>
    </form>
  );
}
