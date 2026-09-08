'use client';
import { useCallback, useState } from 'react';
import { createBrowserSupabase } from '@/lib/supabase/client';
import { processImageFile, EVIDENCE_IMAGE_OPTS } from '@/lib/image/process';
import { createUploadSlot, markUploadReady } from '@/actions/record';
import type { PhotoItem } from './PhotoPicker';

export function usePhotoUploads(initial: PhotoItem[] = []) {
  const [photos, setPhotos] = useState<PhotoItem[]>(initial);

  const patch = useCallback((localId: string, p: Partial<PhotoItem>) => {
    setPhotos((list) => list.map((x) => (x.localId === localId ? { ...x, ...p } : x)));
  }, []);

  const upload = useCallback(async (item: PhotoItem) => {
    if (!item.file) return;
    patch(item.localId, { status: 'processing', error: undefined });
    try {
      const processed = await processImageFile(item.file, EVIDENCE_IMAGE_OPTS);
      patch(item.localId, { status: 'uploading' });
      const slot = await createUploadSlot(processed.contentType, processed.blob.size);
      if (!slot.slot) throw new Error(slot.error ?? 'slot_failed');
      const supabase = createBrowserSupabase();
      const { error } = await supabase.storage.from('evidence').upload(slot.slot.storagePath, processed.blob, { contentType: processed.contentType, upsert: false });
      if (error) throw error;
      const ready = await markUploadReady(slot.slot.uploadId);
      if (ready.error) throw new Error(ready.error);
      patch(item.localId, { status: 'ready', uploadId: slot.slot.uploadId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      patch(item.localId, {
        status: 'error',
        error: msg === 'unsupported_image' ? 'JPEG, PNG, WebP, HEIC 이미지만 올릴 수 있습니다.' : msg && !msg.includes('_') && msg.length < 80 ? msg : '업로드에 실패했습니다. 다시 시도하세요.',
      });
    }
  }, [patch]);

  const add = useCallback((files: File[]) => {
    const items: PhotoItem[] = files.map((file) => ({ localId: crypto.randomUUID(), previewUrl: URL.createObjectURL(file), status: 'processing', file }));
    setPhotos((list) => [...list, ...items]);
    items.forEach((it) => { void upload(it); });
  }, [upload]);

  const remove = useCallback((localId: string) => setPhotos((list) => list.filter((x) => x.localId !== localId)), []);
  const move = useCallback((localId: string, dir: -1 | 1) => setPhotos((list) => {
    const i = list.findIndex((x) => x.localId === localId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return list;
    const copy = [...list];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    return copy;
  }), []);
  const retry = useCallback((localId: string) => {
    const item = photos.find((x) => x.localId === localId);
    if (item) void upload(item);
  }, [photos, upload]);

  const allReady = photos.length > 0 && photos.every((p) => p.status === 'ready' || p.status === 'existing');
  return { photos, setPhotos, add, remove, move, retry, allReady };
}
