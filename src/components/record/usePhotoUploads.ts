'use client';
import { useCallback, useState } from 'react';
import { createBrowserSupabase } from '@/lib/supabase/client';
import { processImageFile, EVIDENCE_IMAGE_OPTS } from '@/lib/image/process';
import { createUploadSlot, markUploadReady } from '@/actions/record';
import { looksLikeScreenshot } from '@/lib/image/screenshot';
import type { PhotoItem } from './PhotoPicker';

function measure(url: string): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export function usePhotoUploads(initial: PhotoItem[] = [], initialCoverId: string | null = null) {
  const [photos, setPhotos] = useState<PhotoItem[]>(initial);
  const [coverId, setCoverId] = useState<string | null>(initialCoverId);
  // 사용자가 직접 고른 뒤에는 자동 추정으로 덮어쓰지 않는다
  const [coverPicked, setCoverPicked] = useState(initialCoverId !== null);

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
      console.error('evidence upload failed', e);
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
    // 스크린샷 추정은 업로드와 별개로 미리보기 URL 로 측정한다 (HEIC 는 브라우저가 못 읽을 수 있으니 null → 추정 안 함)
    const sw = window.screen.width * window.devicePixelRatio, sh = window.screen.height * window.devicePixelRatio;
    items.forEach((it) => { void measure(it.previewUrl).then((d) => { if (d) patch(it.localId, { likelyScreenshot: looksLikeScreenshot(d.w, d.h, sw, sh) }); }); });
  }, [upload, patch]);

  const remove = useCallback((localId: string) => {
    setPhotos((list) => list.filter((x) => x.localId !== localId));
    setCoverId((c) => (c === localId ? null : c));
  }, []);
  const pickCover = useCallback((localId: string) => { setCoverId((c) => (c === localId ? null : localId)); setCoverPicked(true); }, []);
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

  // 기본 대표 사진: 사용자가 고르기 전까지는 스크린샷이 아닌 첫 사진. 사진이 1장이면 그 사진.
  const autoCover = photos.length <= 1 ? photos[0]?.localId ?? null : (photos.find((p) => p.likelyScreenshot === false)?.localId ?? null);
  const effectiveCoverId = coverPicked ? coverId : autoCover;
  /** 제출 시 서버 RPC 에 넘길 순서. 기존(keep) 사진 다음에 새 업로드가 붙는 서버 규칙과 같게 센다. */
  const coverOrderIndex = (() => {
    if (!effectiveCoverId) return null;
    const ordered = [...photos.filter((p) => p.status === 'existing'), ...photos.filter((p) => p.status !== 'existing')];
    const i = ordered.findIndex((p) => p.localId === effectiveCoverId);
    return i < 0 ? null : i;
  })();
  const reset = useCallback(() => { setPhotos([]); setCoverId(null); setCoverPicked(false); }, []);
  return { photos, setPhotos, add, remove, move, retry, allReady, coverId: effectiveCoverId, pickCover, coverOrderIndex, reset };
}
