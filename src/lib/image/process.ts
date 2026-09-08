'use client';

export type ImageKind = 'jpeg' | 'png' | 'webp' | 'heic' | null;

/** 매직 바이트로 실제 이미지 형식 판별 */
export function sniffImageType(buf: ArrayBuffer): ImageKind {
  const b = new Uint8Array(buf.slice(0, 16));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'heif'].includes(brand)) return 'heic';
  }
  return null;
}

export type ProcessedImage = { blob: Blob; width: number; height: number; contentType: 'image/jpeg' };

/**
 * 브라우저에서 리사이즈·재인코딩. canvas 재인코딩으로 EXIF(위치 등)가 제거된다.
 * HEIC/HEIF는 heic-to로 먼저 JPEG 변환.
 */
export async function processImageFile(file: File, opts: { maxEdge: number; quality: number }): Promise<ProcessedImage> {
  const head = await file.slice(0, 16).arrayBuffer();
  const kind = sniffImageType(head);
  if (!kind) throw new Error('unsupported_image');

  let source: Blob = file;
  if (kind === 'heic') {
    const { heicTo } = await import('heic-to');
    source = await heicTo({ blob: file, type: 'image/jpeg', quality: 0.92 });
  }

  const bitmap = await createImageBitmap(source);
  const scale = Math.min(1, opts.maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_unavailable');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', opts.quality));
  if (!blob) throw new Error('encode_failed');
  return { blob, width, height, contentType: 'image/jpeg' };
}

export const EVIDENCE_IMAGE_OPTS = { maxEdge: 2000, quality: 0.85 };
export const AVATAR_IMAGE_OPTS = { maxEdge: 512, quality: 0.85 };
