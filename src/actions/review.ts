'use server';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase/server';
import { messageForError } from '@/lib/errors';
import { reasonSchema, uuidSchema } from '@/lib/domain/validation';

export type ReviewAction = 'approve' | 'reject' | 'unapprove';

export async function reviewRecord(recordId: string, action: ReviewAction, reason: string | null, expectedVersion: number): Promise<{ error?: string }> {
  if (!uuidSchema.safeParse(recordId).success) return { error: '잘못된 요청입니다.' };
  if (action !== 'approve') {
    const r = reasonSchema.safeParse(reason ?? '');
    if (!r.success) return { error: '사유를 입력하세요.' };
    reason = r.data;
  }
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc('review_record', { p_record_id: recordId, p_action: action, p_reason: reason ?? '', p_expected_version: expectedVersion });
  if (error) return { error: messageForError(error) };
  revalidatePath('/'); revalidatePath('/admin'); revalidatePath(`/records/${recordId}`);
  return {};
}
