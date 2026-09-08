import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/types';
import { signedUrls } from '@/lib/storage/signed-url';
import type { WeekDashboard } from './types';

export async function loadDashboard(supabase: SupabaseClient<Database>, groupId: string, weekStart: string): Promise<{ data?: WeekDashboard; error?: string }> {
  const { data, error } = await supabase.rpc('get_week_dashboard', { p_group_id: groupId, p_week_start: weekStart });
  if (error) return { error: error.message };
  const d = data as unknown as WeekDashboard;
  const urls = await signedUrls('avatars', d.members.map((m) => m.avatarPath).filter((p): p is string => Boolean(p)));
  d.members = d.members.map((m) => ({ ...m, avatarUrl: m.avatarPath ? urls.get(m.avatarPath) ?? null : null }));
  return { data: d };
}
