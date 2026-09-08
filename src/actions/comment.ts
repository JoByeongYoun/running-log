'use server';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase/server';
import { messageForError } from '@/lib/errors';
import { commentSchema, uuidSchema } from '@/lib/domain/validation';

export async function addComment(recordId: string, body: string): Promise<{ error?: string }> {
  if (!uuidSchema.safeParse(recordId).success) return { error: '잘못된 요청입니다.' };
  const parsed = commentSchema.safeParse(body);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc('add_comment', { p_record_id: recordId, p_body: parsed.data });
  if (error) return { error: messageForError(error) };
  revalidatePath(`/records/${recordId}`);
  return {};
}

export async function deleteComment(commentId: string, recordId: string): Promise<{ error?: string }> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc('delete_comment', { p_comment_id: commentId });
  if (error) return { error: messageForError(error) };
  revalidatePath(`/records/${recordId}`);
  return {};
}
