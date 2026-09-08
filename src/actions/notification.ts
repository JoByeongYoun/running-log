'use server';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase/server';

export async function markRead(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const supabase = await createServerSupabase();
  await supabase.rpc('mark_notifications_read', { p_ids: ids });
  revalidatePath('/'); revalidatePath('/notifications');
}
