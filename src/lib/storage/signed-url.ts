import 'server-only';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { SIGNED_URL_TTL_SECONDS } from '@/lib/domain/constants';

/**
 * 짧은 만료 서명 URL. 호출 측이 RLS로 이미 조회 가능한 경로만 넘겨야 한다
 * (record_photos / profiles 에서 읽은 경로).
 */
export async function signedUrls(bucket: 'avatars' | 'evidence', paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return out;
  const admin = createAdminSupabase();
  const { data } = await admin.storage.from(bucket).createSignedUrls(unique, SIGNED_URL_TTL_SECONDS);
  for (const item of data ?? []) {
    if (item.signedUrl && item.path) out.set(item.path, item.signedUrl);
  }
  return out;
}

export async function signedUrl(bucket: 'avatars' | 'evidence', path: string | null): Promise<string | null> {
  if (!path) return null;
  const m = await signedUrls(bucket, [path]);
  return m.get(path) ?? null;
}
