'use server';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase/server';
import { messageForError } from '@/lib/errors';
import { uuidSchema } from '@/lib/domain/validation';

export async function toggleLike(recordId: string): Promise<{ liked: boolean; count: number } | { error: string }> {
  if (!uuidSchema.safeParse(recordId).success) return { error: '잘못된 요청입니다.' };
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc('toggle_like', { p_record_id: recordId });
  if (error) return { error: messageForError(error) };
  revalidatePath(`/records/${recordId}`);
  return data as { liked: boolean; count: number };
}
