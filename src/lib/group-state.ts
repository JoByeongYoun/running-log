import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/types';

export type GroupState = {
  membership: { groupId: string; role: 'admin' | 'member'; groupName: string; archived: boolean } | null;
  pendingRequest: { id: string; groupId: string; groupName: string; targetMeters: number; penalty: string } | null;
  lastRejected: { groupName: string; reviewedAt: string } | null;
};

export async function getGroupState(supabase: SupabaseClient<Database>): Promise<GroupState> {
  const { data } = await supabase.rpc('get_my_group_state');
  const d = (data ?? {}) as Partial<GroupState>;
  return { membership: d.membership ?? null, pendingRequest: d.pendingRequest ?? null, lastRejected: d.lastRejected ?? null };
}
