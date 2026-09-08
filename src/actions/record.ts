'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { messageForError, errorCode } from '@/lib/errors';
import { distanceInputSchema, memoSchema, uploadIdsSchema, uuidSchema, firstIssue } from '@/lib/domain/validation';
import { MAX_FILE_BYTES } from '@/lib/domain/constants';

export type UploadSlot = { uploadId: string; storagePath: string };

export async function createUploadSlot(contentType: string, byteSize: number): Promise<{ slot?: UploadSlot; error?: string }> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) return { error: 'JPEG, PNG, WebP 이미지만 올릴 수 있습니다.' };
  if (!Number.isInteger(byteSize) || byteSize < 1 || byteSize > MAX_FILE_BYTES) return { error: '파일은 10MB 이하여야 합니다.' };
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc('create_upload_slot', { p_content_type: contentType, p_byte_size: byteSize });
  if (error) return { error: messageForError(error) };
  const row = data?.[0];
  if (!row) return { error: '업로드 준비에 실패했습니다.' };
  return { slot: { uploadId: row.upload_id, storagePath: row.storage_path } };
}

export async function markUploadReady(uploadId: string): Promise<{ error?: string }> {
  if (!uuidSchema.safeParse(uploadId).success) return { error: '업로드 정보가 올바르지 않습니다.' };
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc('mark_upload_ready', { p_upload_id: uploadId });
  if (error) return { error: messageForError(error) };
  return {};
}

const submitSchema = z.object({
  submissionKey: uuidSchema,
  distance: distanceInputSchema(),
  memo: memoSchema.optional(),
  uploadIds: uploadIdsSchema,
  clientDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type SubmitInput = z.input<typeof submitSchema>;

export async function submitRecord(input: SubmitInput): Promise<{ id?: string; error?: string; code?: string }> {
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc('submit_record', {
    p_submission_key: parsed.data.submissionKey, p_distance_meters: parsed.data.distance,
    p_memo: parsed.data.memo ?? '', p_upload_ids: parsed.data.uploadIds, p_client_date: parsed.data.clientDate,
  });
  if (error) return { error: messageForError(error), code: errorCode(error) ?? undefined };
  revalidatePath('/');
  return { id: data ?? undefined };
}

const updateSchema = z.object({
  recordId: uuidSchema,
  distance: distanceInputSchema(),
  memo: memoSchema.optional(),
  keepPhotoIds: z.array(uuidSchema),
  uploadIds: z.array(uuidSchema),
  expectedVersion: z.number().int().positive(),
});
export type UpdateInput = z.input<typeof updateSchema>;

async function removeEvidence(paths: string[] | null | undefined) {
  if (!paths || paths.length === 0) return;
  const admin = createAdminSupabase();
  await admin.storage.from('evidence').remove(paths);
}

export async function updateRecord(input: UpdateInput): Promise<{ error?: string }> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const d = parsed.data;
  if (d.keepPhotoIds.length + d.uploadIds.length < 1) return { error: '사진을 1장 이상 첨부하세요.' };
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc('update_record', {
    p_record_id: d.recordId, p_distance_meters: d.distance, p_memo: d.memo ?? '',
    p_keep_photo_ids: d.keepPhotoIds, p_upload_ids: d.uploadIds, p_expected_version: d.expectedVersion,
  });
  if (error) return { error: messageForError(error) };
  await removeEvidence(data);
  revalidatePath('/'); revalidatePath(`/records/${d.recordId}`);
  return {};
}

export async function deleteRecord(recordId: string): Promise<{ error?: string }> {
  if (!uuidSchema.safeParse(recordId).success) return { error: '잘못된 요청입니다.' };
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc('delete_record', { p_record_id: recordId });
  if (error) return { error: messageForError(error) };
  await removeEvidence(data);
  revalidatePath('/');
  return {};
}
