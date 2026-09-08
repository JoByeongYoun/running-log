import type { TestUser } from './supabase-test';
import { TINY_JPEG } from './fixtures';

export async function uploadEvidence(user: TestUser, count = 1): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const { data, error } = await user.client.rpc('create_upload_slot', { p_content_type: 'image/jpeg', p_byte_size: TINY_JPEG.length });
    if (error) throw error;
    const slot = data![0];
    const up = await user.client.storage.from('evidence').upload(slot.storage_path, TINY_JPEG, { contentType: 'image/jpeg' });
    if (up.error) throw up.error;
    const ready = await user.client.rpc('mark_upload_ready', { p_upload_id: slot.upload_id });
    if (ready.error) throw ready.error;
    ids.push(slot.upload_id);
  }
  return ids;
}

export async function submit(user: TestUser, meters: number, uploads: string[], key = crypto.randomUUID()) {
  return user.client.rpc('submit_record', { p_submission_key: key, p_distance_meters: meters, p_memo: null, p_upload_ids: uploads });
}
