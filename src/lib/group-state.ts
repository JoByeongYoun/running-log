import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/types';
import type { RunnerType } from '@/lib/domain/runner-type';

export type GroupRules = { targetMeters: number; penalty: string | null; freeMinMeters: number; penaltyPerKmWon: number; zeroKmPenaltyWon: number };

export type GroupState = {
  membership: { groupId: string; role: 'admin' | 'member'; groupName: string; archived: boolean; notice: string | null; noticeUpdatedAt: string | null; runnerType: RunnerType } | null;
  pendingRequest: ({ id: string; groupId: string; groupName: string } & GroupRules) | null;
  lastRejected: { groupName: string; reviewedAt: string } | null;
};

export async function getGroupState(supabase: SupabaseClient<Database>): Promise<GroupState> {
  const { data } = await supabase.rpc('get_my_group_state');
  const d = (data ?? {}) as Partial<GroupState>;
  return { membership: d.membership ?? null, pendingRequest: d.pendingRequest ?? null, lastRejected: d.lastRejected ?? null };
}
