'use client';
import { useRef } from 'react';
import { Button } from '@/components/ui/Button';
import { MAX_PHOTOS } from '@/lib/domain/constants';

export type PhotoItem = {
  localId: string;
  previewUrl: string;
  status: 'processing' | 'uploading' | 'ready' | 'error' | 'existing';
  uploadId?: string;
  photoId?: string; // existing photo (edit mode)
  error?: string;
  file?: File;
};

type Props = {
  photos: PhotoItem[];
  onAdd: (files: File[]) => void;
  onRemove: (localId: string) => void;
  onMove: (localId: string, dir: -1 | 1) => void;
  onRetry: (localId: string) => void;
  disabled?: boolean;
};

export function PhotoPicker({ photos, onAdd, onRemove, onMove, onRetry, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const remaining = MAX_PHOTOS - photos.length;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700">증거 사진 <span className="text-slate-500">({photos.length}/{MAX_PHOTOS})</span></span>
        <input ref={inputRef} type="file" accept="image/*,.heic,.heif" multiple className="sr-only" aria-label="사진 선택"
          onChange={(e) => { const files = Array.from(e.target.files ?? []).slice(0, Math.max(0, remaining)); if (files.length) onAdd(files); e.target.value = ''; }} />
        <Button type="button" variant="secondary" disabled={disabled || remaining <= 0} onClick={() => inputRef.current?.click()}>사진 추가</Button>
      </div>
      <p className="text-xs text-slate-500">1~5장, 장당 10MB 이하. 기록 숫자가 보이게 촬영하세요. 위치 정보는 자동으로 제거됩니다.</p>
      {photos.length > 0 && (
        <ul className="grid grid-cols-3 gap-2">
          {photos.map((p, i) => (
            <li key={p.localId} className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.previewUrl} alt={`사진 ${i + 1}`} className="aspect-square w-full object-cover" />
              <div className="absolute inset-x-0 top-0 flex justify-between p-1">
                <span className="rounded-full bg-black/60 px-1.5 text-xs text-white">{i + 1}</span>
                <button type="button" aria-label="사진 삭제" disabled={disabled} onClick={() => onRemove(p.localId)} className="min-h-7 min-w-7 rounded-full bg-black/60 text-white">×</button>
              </div>
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/50 px-1 py-0.5 text-xs text-white">
                <button type="button" aria-label="앞으로" disabled={disabled || i === 0} onClick={() => onMove(p.localId, -1)} className="min-h-7 min-w-7 disabled:opacity-30">‹</button>
                <span>
                  {p.status === 'processing' && '처리 중'}
                  {p.status === 'uploading' && '업로드 중'}
                  {(p.status === 'ready' || p.status === 'existing') && '완료'}
                  {p.status === 'error' && <button type="button" onClick={() => onRetry(p.localId)} className="underline">실패 · 재시도</button>}
                </span>
                <button type="button" aria-label="뒤로" disabled={disabled || i === photos.length - 1} onClick={() => onMove(p.localId, 1)} className="min-h-7 min-w-7 disabled:opacity-30">›</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {photos.some((p) => p.status === 'error') && <p role="alert" className="text-xs text-red-600">{photos.find((p) => p.status === 'error')?.error}</p>}
    </div>
  );
}
