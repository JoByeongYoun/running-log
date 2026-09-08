'use server';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase/server';
import { messageForError } from '@/lib/errors';

export async function requestJoin(code: string): Promise<{ error?: string }> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc('request_join', { p_code: code });
  if (error) return { error: messageForError(error) };
  revalidatePath('/');
  return {};
}

export async function cancelJoinRequest(requestId: string): Promise<{ error?: string }> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc('cancel_join_request', { p_request_id: requestId });
  if (error) return { error: messageForError(error) };
  revalidatePath('/');
  return {};
}

export async function reviewJoinRequest(requestId: string, approve: boolean): Promise<{ error?: string }> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc('review_join_request', { p_request_id: requestId, p_approve: approve });
  if (error) return { error: messageForError(error) };
  revalidatePath('/'); revalidatePath('/admin');
  return {};
}
