'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteRecord, updateRecord } from '@/actions/record';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input, Textarea } from '@/components/ui/Input';
import { FormMessage } from '@/components/ui/FormMessage';
import { useToast } from '@/components/ui/Toast';
import { PhotoPicker } from './PhotoPicker';
import { usePhotoUploads } from './usePhotoUploads';

type Props = {
  record: { id: string; distance: string; memo: string; version: number; status: 'pending' | 'rejected' | 'approved' | 'expired' };
  photos: { id: string; url: string }[];
};

export function RecordOwnerActions({ record, photos: existing }: Props) {
  const [edit, setEdit] = useState(false);
  const [del, setDel] = useState(false);
  const [distance, setDistance] = useState(record.distance);
  const [memo, setMemo] = useState(record.memo);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { photos, add, remove, move, retry, allReady } = usePhotoUploads(existing.map((p) => ({ localId: p.id, previewUrl: p.url, status: 'existing', photoId: p.id })));
  const router = useRouter();
  const toast = useToast();

  return (
    <section className="flex gap-2">
      <Button variant="secondary" full onClick={() => setEdit(true)}>{record.status === 'rejected' ? '수정하고 재제출' : '수정'}</Button>
      <Button variant="danger" full onClick={() => setDel(true)}>삭제</Button>

      <Modal open={edit} onClose={() => setEdit(false)} title="기록 수정" wide>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setError(null); start(async () => {
          const res = await updateRecord({
            recordId: record.id, distance, memo, expectedVersion: record.version,
            keepPhotoIds: photos.filter((p) => p.status === 'existing' && p.photoId).map((p) => p.photoId!),
            uploadIds: photos.filter((p) => p.status === 'ready' && p.uploadId).map((p) => p.uploadId!),
          });
          if (res.error) { setError(res.error); return; }
          toast('수정했습니다. 다시 승인 대기 상태가 됩니다.');
          setEdit(false); router.refresh();
        }); }}>
          <Input label="거리 (km)" value={distance} onChange={(e) => setDistance(e.target.value)} inputMode="decimal" required hint="0.01 ~ 500km, 소수 둘째 자리까지" />
          <PhotoPicker photos={photos} onAdd={add} onRemove={remove} onMove={move} onRetry={retry} disabled={pending} />
          <Textarea label="메모 (선택)" value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={1000} rows={2} />
          <p className="text-xs text-slate-500">수정하면 관리자가 내용을 다시 확인합니다.</p>
          <FormMessage error={error} />
          <div className="flex gap-2">
            <Button type="button" variant="secondary" full onClick={() => setEdit(false)}>취소</Button>
            <Button type="submit" full loading={pending} disabled={!allReady}>저장</Button>
          </div>
        </form>
      </Modal>

      <Modal open={del} onClose={() => setDel(false)} title="기록을 삭제할까요?">
        <p className="text-sm text-slate-700">사진과 댓글도 함께 삭제됩니다. 되돌릴 수 없습니다.</p>
        <div className="mt-5 flex gap-2">
          <Button variant="secondary" full onClick={() => setDel(false)}>취소</Button>
          <Button variant="danger" full loading={pending} onClick={() => start(async () => {
            const res = await deleteRecord(record.id);
            if (res.error) { toast(res.error, 'error'); return; }
            toast('삭제했습니다.'); router.push('/');
          })}>삭제</Button>
        </div>
      </Modal>
    </section>
  );
}
