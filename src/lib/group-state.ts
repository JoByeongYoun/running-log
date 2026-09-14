import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/types';

export type GroupState = {
  membership: { groupId: string; role: 'admin' | 'member'; groupName: string; archived: boolean; notice: string | null; noticeUpdatedAt: string | null; resting: boolean; restStartedAt: string | null } | null;
  pendingRequest: { id: string; groupId: string; groupName: string; targetMeters: number; penalty: string } | null;
  lastRejected: { groupName: string; reviewedAt: string } | null;
  pendingRestRequest: { id: string; reason: string | null; createdAt: string } | null;
};

export async function getGroupState(supabase: SupabaseClient<Database>): Promise<GroupState> {
  const { data } = await supabase.rpc('get_my_group_state');
  const d = (data ?? {}) as Partial<GroupState>;
  return { membership: d.membership ?? null, pendingRequest: d.pendingRequest ?? null, lastRejected: d.lastRejected ?? null, pendingRestRequest: d.pendingRestRequest ?? null };
}
