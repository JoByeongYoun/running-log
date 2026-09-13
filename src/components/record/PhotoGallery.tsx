'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { removePhoto } from '@/actions/record';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { PhotoLightbox } from './PhotoLightbox';

type Photo = { id: string; url: string };
type Editable = { id: string; distance: string; memo: string; version: number };

export function PhotoGallery({ photos, editable }: { photos: Photo[]; editable?: Editable }) {
  const [idx, setIdx] = useState<number | null>(null);
  const [target, setTarget] = useState<Photo | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  if (photos.length === 0) return null;
  const canDelete = Boolean(editable) && photos.length > 1;

  return (
    <section className="rounded-2xl border border-slate-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">증거 사진 {photos.length}장</h2>
        {editable && photos.length === 1 && <span className="text-xs text-slate-400">사진은 최소 1장 필요</span>}
      </div>
      <ul className="grid grid-cols-3 gap-2">
        {photos.map((p, i) => (
          <li key={p.id} className="relative">
            <button type="button" onClick={() => setIdx(i)} className="block w-full overflow-hidden rounded-xl" aria-label={`사진 ${i + 1} 확대`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={`증거 사진 ${i + 1}`} className="aspect-square w-full object-cover" loading="lazy" />
            </button>
            {canDelete && (
              <button
                type="button" onClick={() => setTarget(p)} aria-label={`사진 ${i + 1} 삭제`}
                className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white shadow hover:bg-red-600"
              >
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>
      <PhotoLightbox photos={photos} index={idx} onChange={setIdx} />
      {editable && (
        <Modal open={target !== null} onClose={() => setTarget(null)} title="이 사진을 삭제할까요?">
          <p className="text-sm text-slate-700">기록은 유지되고 사진만 삭제됩니다. 삭제 후에는 관리자가 다시 확인합니다.</p>
          <div className="mt-5 flex gap-2">
            <Button variant="secondary" full onClick={() => setTarget(null)}>취소</Button>
            <Button variant="danger" full loading={pending} onClick={() => start(async () => {
              if (!target) return;
              const res = await removePhoto({
                recordId: editable.id, photoId: target.id, keepPhotoIds: photos.map((x) => x.id),
                distance: editable.distance, memo: editable.memo, expectedVersion: editable.version,
              });
              if (res.error) { toast(res.error, 'error'); return; }
              toast('사진을 삭제했습니다.');
              setTarget(null); router.refresh();
            })}>삭제</Button>
          </div>
        </Modal>
      )}
    </section>
  );
}
