import { describe, it, expect, beforeAll } from 'vitest';
import { adminClient, createTestUser, completeProfile, resetAll, setFakeNow, expectRpcError, type TestUser } from '@/test/supabase-test';
import { uploadEvidence, submit } from '@/test/records-helpers';

async function member(label: string) { const u = await createTestUser(label); await completeProfile(u, label); return u; }

describe('weekly dashboard', () => {
  const admin = adminClient();
  let owner: TestUser, users: TestUser[], late: TestUser, outsider: TestUser, groupId: string;

  beforeAll(async () => {
    await resetAll();
    await setFakeNow('2026-09-02T03:00:00Z');
    owner = await member('owner');
    const g = (await owner.client.rpc('create_group', { p_name: '대시보드', p_target_meters: 10000, p_penalty: '없음' })).data![0];
    groupId = g.group_id;
    users = [await member('u1'), await member('u2'), await member('u3')];
    for (const u of users) {
      const r = (await u.client.rpc('request_join', { p_code: g.invite_code })).data as string;
      await owner.client.rpc('review_join_request', { p_request_id: r, p_approve: true });
    }
    await setFakeNow('2026-09-09T03:00:00Z'); // Wed
    late = await member('late');
    const r = (await late.client.rpc('request_join', { p_code: g.invite_code })).data as string;
    await owner.client.rpc('review_join_request', { p_request_id: r, p_approve: true });
    outsider = await member('out');
    // records: u1 20km approved, u2 10km approved, u3 10km approved + 5km pending, owner 0, late 30km approved (prep)
    const approve = async (id: string) => owner.client.rpc('review_record', { p_record_id: id, p_action: 'approve', p_reason: null, p_expected_version: 1 });
    await approve((await submit(users[0], 20000, await uploadEvidence(users[0], 1))).data as string);
    await approve((await submit(users[1], 10000, await uploadEvidence(users[1], 1))).data as string);
    await approve((await submit(users[2], 10000, await uploadEvidence(users[2], 1))).data as string);
    await submit(users[2], 5000, await uploadEvidence(users[2], 1));
    await approve((await submit(late, 30000, await uploadEvidence(late, 1))).data as string);
  });

  it('returns 1,2,2,4 ranks among eligible, prep members unranked, pending separated', async () => {
    const { data, error } = await users[0].client.rpc('get_week_dashboard', { p_group_id: groupId, p_week_start: '2026-09-07' });
    expect(error).toBeNull();
    const d = data as { members: Array<{ userId: string; rank: number | null; approvedMeters: number; pendingMeters: number; outcome: string; joinedThisWeek: boolean; days: Array<{ date: string; approvedMeters: number; pendingMeters: number }> }>; me: { approvedMeters: number; pendingMeters: number }; pendingCount: number; provisional: boolean; week: { targetMeters: number } };
    const by = Object.fromEntries(d.members.map((m) => [m.userId, m]));
    expect(by[users[0].id]).toMatchObject({ rank: 1, approvedMeters: 20000, outcome: 'provisional_success' });
    expect(by[users[1].id]).toMatchObject({ rank: 2, approvedMeters: 10000, outcome: 'provisional_success' });
    expect(by[users[2].id]).toMatchObject({ rank: 2, approvedMeters: 10000, pendingMeters: 5000, outcome: 'pending_review' });
    expect(by[owner.id]).toMatchObject({ rank: 4, approvedMeters: 0, outcome: 'provisional_fail' });
    expect(by[late.id]).toMatchObject({ rank: null, joinedThisWeek: true, approvedMeters: 30000, outcome: 'not_evaluated' });
    expect(d.members[0].userId).toBe(users[0].id);
    expect(d.pendingCount).toBe(1);
    expect(d.provisional).toBe(true);
    expect(d.me).toMatchObject({ approvedMeters: 20000, pendingMeters: 0 });
    const days = by[users[2].id].days;
    expect(days).toHaveLength(7);
    expect(days.map((x) => x.date)).toEqual(['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13']);
    expect(days[2]).toMatchObject({ approvedMeters: 10000, pendingMeters: 5000 });
  });

  it('rejects outsiders, future weeks, non-monday, and pre-creation weeks', async () => {
    expectRpcError(await outsider.client.rpc('get_week_dashboard', { p_group_id: groupId, p_week_start: '2026-09-07' }), 'forbidden');
    expectRpcError(await users[0].client.rpc('get_week_dashboard', { p_group_id: groupId, p_week_start: '2026-09-14' }), 'invalid_input');
    expectRpcError(await users[0].client.rpc('get_week_dashboard', { p_group_id: groupId, p_week_start: '2026-09-08' }), 'invalid_input');
    expectRpcError(await users[0].client.rpc('get_week_dashboard', { p_group_id: groupId, p_week_start: '2026-08-24' }), 'before_group_created');
    expect((await users[0].client.rpc('get_available_weeks', { p_group_id: groupId })).data).toEqual(['2026-08-31', '2026-09-07']);
  });

  it('reading the dashboard reconciles weeks even if cron never ran', async () => {
    await setFakeNow('2026-09-14T04:00:00Z'); // next Monday 13:00 KST (past deadline)
    const cur = await users[0].client.rpc('get_week_dashboard', { p_group_id: groupId, p_week_start: '2026-09-14' });
    expect(cur.error).toBeNull();
    const prev = await users[0].client.rpc('get_week_dashboard', { p_group_id: groupId, p_week_start: '2026-09-07' });
    const d = prev.data as { provisional: boolean; week: { state: string; groupName: string }; members: Array<{ userId: string; rank: number | null; outcome: string }> };
    expect(d.provisional).toBe(false);
    expect(d.week.state).toBe('finalized');
    const by = Object.fromEntries(d.members.map((m) => [m.userId, m]));
    expect(by[users[2].id]).toMatchObject({ rank: 2, outcome: 'success' }); // pending 5km expired, 10km approved stays
    expect(by[owner.id]).toMatchObject({ rank: 4, outcome: 'fail' });
  });
});
