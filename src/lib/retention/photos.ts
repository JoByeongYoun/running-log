import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PHOTO_RETENTION_WEEKS } from '@/lib/domain/constants';

const REMOVE_BATCH = 100;

export type PurgeResult = { expiredUploads: number; purgedPhotos: number; removed: number; failed: number };

/**
 * 스토리지 정리: 만료된 업로드 슬롯의 객체와 보관 기간이 지난 증거 사진을 제거한다.
 * DB 행은 RPC 안에서 먼저 지워지고 경로가 반환되므로, 객체 삭제가 실패하면 로그로 남긴다.
 */
export async function purgeEvidence(admin: SupabaseClient): Promise<PurgeResult> {
  const expired = await admin.rpc('cleanup_expired_uploads');
  if (expired.error) throw expired.error;
  const purge = await admin.rpc('purge_expired_photos', { p_keep: `${PHOTO_RETENTION_WEEKS} weeks` });
  if (purge.error) throw purge.error;
  const expiredPaths: string[] = expired.data ?? [];
  const purgedPaths: string[] = purge.data ?? [];
  const paths = [...expiredPaths, ...purgedPaths];
  const result: PurgeResult = { expiredUploads: expiredPaths.length, purgedPhotos: purgedPaths.length, removed: 0, failed: 0 };
  for (let i = 0; i < paths.length; i += REMOVE_BATCH) {
    const batch = paths.slice(i, i + REMOVE_BATCH);
    const { error } = await admin.storage.from('evidence').remove(batch);
    if (error) {
      result.failed += batch.length;
      console.error(JSON.stringify({ job: 'purge_evidence', error: error.message, paths: batch }));
    } else {
      result.removed += batch.length;
    }
  }
  return result;
}
