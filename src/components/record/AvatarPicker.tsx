'use client';
import { useRef, useState } from 'react';
import { createBrowserSupabase } from '@/lib/supabase/client';
import { processImageFile, AVATAR_IMAGE_OPTS } from '@/lib/image/process';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';

type Props = { userId: string; initialUrl: string | null; name: string; onUploaded: (path: string) => void };

export function AvatarPicker({ userId, initialUrl, name, onUploaded }: Props) {
  const [preview, setPreview] = useState<string | null>(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const processed = await processImageFile(file, AVATAR_IMAGE_OPTS);
      const path = `${userId}/${crypto.randomUUID()}.jpg`;
      const supabase = createBrowserSupabase();
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, processed.blob, { contentType: 'image/jpeg', upsert: false });
      if (upErr) throw upErr;
      setPreview(URL.createObjectURL(processed.blob));
      onUploaded(path);
    } catch (e) {
      console.error('avatar upload failed', e);
      setError(e instanceof Error && e.message === 'unsupported_image' ? 'JPEG, PNG, WebP, HEIC 이미지만 올릴 수 있습니다.' : '사진 업로드에 실패했습니다. 다시 시도하세요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar src={preview} name={name} size={72} />
      <div className="space-y-1">
        <input ref={inputRef} type="file" accept="image/*,.heic,.heif" className="sr-only" aria-label="프로필 사진 선택"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ''; }} />
        <Button type="button" variant="secondary" loading={busy} onClick={() => inputRef.current?.click()}>
          {preview ? '사진 변경' : '사진 선택'}
        </Button>
        <p className="text-xs text-slate-500">필수 · 10MB 이하</p>
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
