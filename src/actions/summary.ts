'use server';
import { createServerSupabase } from '@/lib/supabase/server';
import { signedUrls } from '@/lib/storage/signed-url';
import type { WeekSummary } from '@/lib/dashboard/types';

async function withAvatars(summary: WeekSummary): Promise<WeekSummary> {
  const urls = await signedUrls('avatars', summary.members.map((m) => m.avatarPath).filter((p): p is string => Boolean(p)));
  return { ...summary, members: summary.members.map((m) => ({ ...m, avatarUrl: m.avatarPath ? urls.get(m.avatarPath) ?? null : null })) };
}

export async function claimSummaryAutoShow(): Promise<WeekSummary | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc('claim_summary_auto_show');
  if (error || !data) return null;
  return withAvatars(data as unknown as WeekSummary);
}

export async function getWeekSummary(groupId: string, weekStart: string): Promise<WeekSummary | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc('get_week_summary', { p_group_id: groupId, p_week_start: weekStart });
  if (error || !data) return null;
  return withAvatars(data as unknown as WeekSummary);
}
