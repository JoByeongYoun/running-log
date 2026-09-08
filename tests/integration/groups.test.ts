import { describe, it, expect, beforeAll } from 'vitest';
import { adminClient, createTestUser, completeProfile, resetAll, setFakeNow, expectRpcError, type TestUser } from '@/test/supabase-test';

async function newMember(label: string): Promise<TestUser> {
  const u = await createTestUser(label);
  await completeProfile(u, label);
  return u;
}

describe('group lifecycle', () => {
  const admin = adminClient();
  beforeAll(async () => { await resetAll(); await setFakeNow('2026-09-09T03:00:00Z'); /* Wed 12:00 KST */ });

  it('creates a group with admin membership, current week, and invite', async () => {
    const owner = await newMember('owner');
    const { data, error } = await owner.client.rpc('create_group', { p_name: '새벽러너', p_target_meters: 20000, p_penalty: '커피 쏘기' });
    expect(error).toBeNull();
    const row = data![0];
    expect(row.invite_code).toHaveLength(14);
    const ms = await admin.from('memberships').select('*').eq('group_id', row.group_id);
    expect(ms.data).toHaveLength(1);
    expect(ms.data![0].role).toBe('admin');
    const weeks = await admin.from('group_weeks').select('*').eq('group_id', row.group_id);
    expect(weeks.data).toHaveLength(1);
    expect(weeks.data![0].week_start).toBe('2026-09-07');
    expect(weeks.data![0].target_meters).toBe(20000);
    const wm = await admin.from('week_members').select('*').eq('week_id', weeks.data![0].id);
    expect(wm.data![0]).toMatchObject({ eligible: false, joined_this_week: true });

    const again = await owner.client.rpc('create_group', { p_name: '둘째', p_target_meters: 1000, p_penalty: '없음' });
    expectRpcError(again, 'already_in_group');

    const lookup = await admin.rpc('lookup_invite', { p_code: row.invite_code });
    expect(lookup.data![0]).toMatchObject({ name: '새벽러너', target_meters: 20000, penalty: '커피 쏘기', archived: false });
    expect((await admin.rpc('lookup_invite', { p_code: 'nope' })).data).toHaveLength(0);

    const bad = await (await newMember('bad')).client.rpc('create_group', { p_name: 'x', p_target_meters: 1000, p_penalty: '없음' });
    expectRpcError(bad, 'invalid_input');
  });

  it('join request → approve creates membership and week member; single membership guaranteed', async () => {
    const owner = await newMember('own2');
    const { data } = await owner.client.rpc('create_group', { p_name: '그룹2', p_target_meters: 10000, p_penalty: '없음' });
    const { group_id, invite_code } = data![0];
    const joiner = await newMember('joiner');
    const req = await joiner.client.rpc('request_join', { p_code: invite_code });
    expect(req.error).toBeNull();
    expect((await admin.from('notifications').select('*').eq('user_id', owner.id)).data).toHaveLength(1);

    const notAdmin = await joiner.client.rpc('review_join_request', { p_request_id: req.data, p_approve: true });
    expectRpcError(notAdmin, 'forbidden');

    const ok = await owner.client.rpc('review_join_request', { p_request_id: req.data, p_approve: true });
    expect(ok.error).toBeNull();
    const ms = await admin.from('memberships').select('*').eq('user_id', joiner.id).is('left_at', null);
    expect(ms.data).toHaveLength(1);
    const wm = await admin.from('week_members').select('*').eq('user_id', joiner.id);
    expect(wm.data![0]).toMatchObject({ eligible: false, joined_this_week: true });
    expect((await admin.from('notifications').select('*').eq('user_id', joiner.id)).data).toHaveLength(1);

    // joiner now in group: a second request must fail
    expectRpcError(await joiner.client.rpc('request_join', { p_code: invite_code }), 'already_in_group');
    void group_id;
  });

  it('concurrent approvals from two groups yield exactly one active membership', async () => {
    const o1 = await newMember('c1');
    const o2 = await newMember('c2');
    const g1 = (await o1.client.rpc('create_group', { p_name: '동시1', p_target_meters: 1000, p_penalty: '없음' })).data![0];
    const g2 = (await o2.client.rpc('create_group', { p_name: '동시2', p_target_meters: 1000, p_penalty: '없음' })).data![0];
    const u = await newMember('race');
    const r1 = (await u.client.rpc('request_join', { p_code: g1.invite_code })).data as string;
    // cancel so a second request can be made, then re-request g1 later to have two pending across groups is impossible by design;
    // simulate race by inserting second pending request directly with admin (bypassing the one-pending rule is not possible: partial unique index)
    await u.client.rpc('cancel_join_request', { p_request_id: r1 });
    const r2 = (await u.client.rpc('request_join', { p_code: g2.invite_code })).data as string;
    // Re-open r1 as pending via admin to create the race scenario would violate the unique index; so instead race approve + create_group.
    const [approve, create] = await Promise.all([
      o2.client.rpc('review_join_request', { p_request_id: r2, p_approve: true }),
      u.client.rpc('create_group', { p_name: '레이스그룹', p_target_meters: 1000, p_penalty: '없음' }),
    ]);
    const successes = [approve.error === null, create.error === null].filter(Boolean).length;
    expect(successes).toBe(1);
    const active = await admin.from('memberships').select('*').eq('user_id', u.id).is('left_at', null);
    expect(active.data).toHaveLength(1);
  });

  it('rejected requester can request again; cancel works', async () => {
    const owner = await newMember('own3');
    const { invite_code } = (await owner.client.rpc('create_group', { p_name: '그룹3', p_target_meters: 1000, p_penalty: '없음' })).data![0];
    const u = await newMember('rej');
    const r = (await u.client.rpc('request_join', { p_code: invite_code })).data as string;
    expectRpcError(await u.client.rpc('request_join', { p_code: invite_code }), 'pending_request_exists');
    expect((await owner.client.rpc('review_join_request', { p_request_id: r, p_approve: false })).error).toBeNull();
    const state = await u.client.rpc('get_my_group_state');
    expect(state.data.lastRejected.groupName).toBe('그룹3');
    const r2 = (await u.client.rpc('request_join', { p_code: invite_code })).data as string;
    expect((await u.client.rpc('cancel_join_request', { p_request_id: r2 })).error).toBeNull();
    expect((await u.client.rpc('get_my_group_state')).data.pendingRequest).toBeNull();
  });

  it('transfer, leave, archive, and settings scheduling', async () => {
    const owner = await newMember('own4');
    const { group_id, invite_code } = (await owner.client.rpc('create_group', { p_name: '그룹4', p_target_meters: 1000, p_penalty: '없음' })).data![0];
    const m = await newMember('mem4');
    const r = (await m.client.rpc('request_join', { p_code: invite_code })).data as string;
    await owner.client.rpc('review_join_request', { p_request_id: r, p_approve: true });

    expectRpcError(await owner.client.rpc('leave_group'), 'transfer_required');
    expectRpcError(await m.client.rpc('transfer_admin', { p_group_id: group_id, p_to_user_id: m.id }), 'forbidden');
    expect((await owner.client.rpc('transfer_admin', { p_group_id: group_id, p_to_user_id: m.id })).error).toBeNull();
    const admins = await admin.from('memberships').select('user_id').eq('group_id', group_id).is('left_at', null).eq('role', 'admin');
    expect(admins.data).toEqual([{ user_id: m.id }]);

    // settings scheduling replaces next-week row
    expect((await m.client.rpc('schedule_group_settings', { p_group_id: group_id, p_target_meters: 5000, p_penalty: '벌금' })).error).toBeNull();
    expect((await m.client.rpc('schedule_group_settings', { p_group_id: group_id, p_target_meters: 7000, p_penalty: '벌금2' })).error).toBeNull();
    const next = await admin.from('group_settings').select('*').eq('group_id', group_id).eq('effective_week_start', '2026-09-14');
    expect(next.data).toHaveLength(1);
    expect(next.data![0].target_meters).toBe(7000);

    // former owner (now member) leaves
    expect((await owner.client.rpc('leave_group')).error).toBeNull();
    const left = await admin.from('memberships').select('left_at').eq('user_id', owner.id).single();
    expect(left.data!.left_at).not.toBeNull();
    const wm = await admin.from('week_members').select('*').eq('user_id', owner.id).single();
    expect(wm.data).toMatchObject({ left_during_week: true, eligible: false });

    // last admin leaves → archived; join blocked
    expect((await m.client.rpc('leave_group')).error).toBeNull();
    const g = await admin.from('groups').select('archived_at').eq('id', group_id).single();
    expect(g.data!.archived_at).not.toBeNull();
    const late = await newMember('late');
    expectRpcError(await late.client.rpc('request_join', { p_code: invite_code }), 'group_archived');
  });

  it('eligibility snapshot uses membership timestamps relative to week start', async () => {
    const owner = await newMember('own5');
    const { group_id, invite_code } = (await owner.client.rpc('create_group', { p_name: '그룹5', p_target_meters: 1000, p_penalty: '없음' })).data![0];
    // move to next week Tuesday, member joins
    await setFakeNow('2026-09-15T03:00:00Z');
    const m = await newMember('mem5');
    const r = (await m.client.rpc('request_join', { p_code: invite_code })).data as string;
    await owner.client.rpc('review_join_request', { p_request_id: r, p_approve: true });
    const w2 = await admin.from('group_weeks').select('id').eq('group_id', group_id).eq('week_start', '2026-09-14').single();
    const rows = await admin.from('week_members').select('user_id, eligible, joined_this_week').eq('week_id', w2.data!.id);
    const byUser = Object.fromEntries(rows.data!.map((x) => [x.user_id, x]));
    expect(byUser[owner.id]).toMatchObject({ eligible: true, joined_this_week: false });
    expect(byUser[m.id]).toMatchObject({ eligible: false, joined_this_week: true });
    await setFakeNow('2026-09-09T03:00:00Z');
  });
});
