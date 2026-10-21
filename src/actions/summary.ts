'use server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabase } from '@/lib/supabase/server';
import { signedUrls } from '@/lib/storage/signed-url';
import { pickSummaryPhotos } from '@/lib/dashboard/summary-photos';
import type { Database } from '@/lib/db/types';
import type { WeekSummary } from '@/lib/dashboard/types';

async function withAvatars(summary: WeekSummary): Promise<WeekSummary> {
  const urls = await signedUrls('avatars', summary.members.map((m) => m.avatarPath).filter((p): p is string => Boolean(p)));
  return { ...summary, members: summary.members.map((m) => ({ ...m, avatarUrl: m.avatarPath ? urls.get(m.avatarPath) ?? null : null })) };
}

/** 이번 주 승인 기록의 사진을 모아 콜라주용으로 고른다. RLS 로 읽을 수 있는 경로만 서명한다. */
async function withPhotos(supabase: SupabaseClient<Database>, summary: WeekSummary): Promise<WeekSummary['photos']> {
  const { data } = await supabase
    .from('running_records')
    .select('id, user_id, activity_date, record_photos(storage_path, order_index, is_cover)')
    .eq('week_id', summary.week.id).eq('status', 'approved').is('photos_purged_at', null)
    .order('activity_date');
  const nick = new Map(summary.members.map((m) => [m.userId, m.nickname]));
  const picked = pickSummaryPhotos((data ?? []).map((r) => ({
    recordId: r.id, userId: r.user_id, nickname: nick.get(r.user_id) ?? '',
    // 대표 사진(셀카)이 있으면 그것을, 없으면 순서상 첫 사진을 쓴다
    paths: [...r.record_photos].sort((a, b) => Number(b.is_cover) - Number(a.is_cover) || a.order_index - b.order_index).map((p) => p.storage_path),
  })));
  const urls = await signedUrls('evidence', picked.map((p) => p.path));
  return picked.map((p) => ({ ...p, url: urls.get(p.path) ?? '' })).filter((p) => p.url);
}

async function enrich(supabase: SupabaseClient<Database>, raw: WeekSummary): Promise<WeekSummary> {
  const [summary, photos] = await Promise.all([withAvatars(raw), withPhotos(supabase, raw)]);
  return { ...summary, photos };
}

export async function claimSummaryAutoShow(): Promise<WeekSummary | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc('claim_summary_auto_show');
  if (error || !data) return null;
  return enrich(supabase, data as unknown as WeekSummary);
}

export async function getWeekSummary(groupId: string, weekStart: string): Promise<WeekSummary | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc('get_week_summary', { p_group_id: groupId, p_week_start: weekStart });
  if (error || !data) return null;
  return enrich(supabase, data as unknown as WeekSummary);
}
