'use server';
import { createServerSupabase } from '@/lib/supabase/server';
import { messageForError } from '@/lib/errors';

export async function leaveGroup(): Promise<{ error?: string }> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc('leave_group');
  if (error) return { error: messageForError(error) };
  return {};
}
