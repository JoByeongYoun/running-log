import { describe, it, expect, beforeAll } from 'vitest';
import { adminClient, createTestUser, completeProfile, resetAll, setFakeNow, expectRpcError, type TestUser } from '@/test/supabase-test';

async function newMember(label: string): Promise<TestUser> {
  const u = await createTestUser(label);
  await completeProfile(u, label);
  return u;
}

async function setupGroup(name: string, tag: string) {
  const owner = await newMember('own-' + tag);
  const g = (await owner.client.rpc('create_group', { p_name: name, p_target_meters: 10000, p_penalty: '없음' })).data![0];
  const member = await newMember('mem-' + tag);
  const req = await member.client.rpc('request_join', { p_code: g.invite_code });
  await owner.client.rpc('review_join_request', { p_request_id: req.data, p_approve: true });
  return { owner, member, groupId: g.group_id as string };
}

describe('rest (temporary exemption from evaluation)', () => {
  const admin = adminClient();
  beforeAll(async () => { await resetAll(); });

  it('member requests rest → admin approves → member is excluded from this week and next week', async () => {
    await setFakeNow('2026-09-09T03:00:00Z'); // Wed
    const { owner, member, groupId } = await setupGroup('휴식1', 'r1');
    // move to next week so the member is eligible
    await setFakeNow('2026-09-16T03:00:00Z');
    const before = (await member.client.rpc('get_week_dashboard', { p_group_id: groupId, p_week_start: '2026-09-14' })).data as { me: { eligible: boolean; resting: boolean } };
    expect(before.me).toMatchObject({ eligible: true, resting: false });

    const req = await member.client.rpc('request_rest', { p_reason: '해외 출장' });
    expect(req.error).toBeNull();
    expectRpcError(await member.client.rpc('request_rest', { p_reason: null }), 'pending_request_exists');
    expect((await admin.from('notifications').select('type').eq('user_id', owner.id).eq('type', 'rest_request')).data).toHaveLength(1);

    const state = (await member.client.rpc('get_my_group_state')).data as { membership: { resting: boolean }; pendingRestRequest: { id: string; reason: string } | null };
    expect(state.membership.resting).toBe(false);
    expect(state.pendingRestRequest).toMatchObject({ id: req.data, reason: '해외 출장' });

    expectRpcError(await member.client.rpc('review_rest_request', { p_request_id: req.data, p_approve: true }), 'forbidden');
    const ok = await owner.client.rpc('review_rest_request', { p_request_id: req.data, p_approve: true });
    expect(ok.error).toBeNull();
    expectRpcError(await owner.client.rpc('review_rest_request', { p_request_id: req.data, p_approve: true }), 'invalid_status');

    const ms = await admin.from('memberships').select('rest_started_at').eq('user_id', member.id).is('left_at', null).single();
    expect(ms.data!.rest_started_at).not.toBeNull();
    expect((await admin.from('notifications').select('type').eq('user_id', member.id).eq('type', 'rest_result')).data).toHaveLength(1);

    // this (open) week: immediately not evaluated, flagged resting
    const now = (await member.client.rpc('get_week_dashboard', { p_group_id: groupId, p_week_start: '2026-09-14' })).data as { me: { eligible: boolean; resting: boolean }; members: { userId: string; resting: boolean; restingNow: boolean; eligible: boolean; outcome: string }[] };
    expect(now.me).toMatchObject({ eligible: false, resting: true });
    const row = now.members.find((m) => m.userId === member.id)!;
    expect(row).toMatchObject({ resting: true, restingNow: true, eligible: false, outcome: 'not_evaluated' });
    const ownerRow = now.members.find((m) => m.userId === owner.id)!;
    expect(ownerRow).toMatchObject({ resting: false, eligible: true });

    // next week snapshot also excludes the resting member
    await setFakeNow('2026-09-23T03:00:00Z');
    const next = (await member.client.rpc('get_week_dashboard', { p_group_id: groupId, p_week_start: '2026-09-21' })).data as { me: { eligible: boolean; resting: boolean } };
    expect(next.me).toMatchObject({ eligible: false, resting: true });

    // notifications carry meta for the UI
    const feed = (await owner.client.rpc('get_notifications')).data as { type: string; meta: Record<string, unknown>; link: string | null }[];
    const rr = feed.find((n) => n.type === 'rest_request')!;
    expect(rr.meta).toMatchObject({ nickname: 'mem-r1', reason: '해외 출장' });
    expect(rr.link).toBe('/admin?tab=requests');
    const mf = (await member.client.rpc('get_notifications')).data as { type: string; meta: Record<string, unknown> }[];
    expect(mf.find((n) => n.type === 'rest_result')!.meta).toMatchObject({ status: 'approved', groupName: '휴식1' });

    // member ends rest → eligible again this week (still open), admin notified
    const end = await member.client.rpc('end_my_rest');
    expect(end.error).toBeNull();
    expectRpcError(await member.client.rpc('end_my_rest'), 'not_resting');
    const after = (await member.client.rpc('get_week_dashboard', { p_group_id: groupId, p_week_start: '2026-09-21' })).data as { me: { eligible: boolean; resting: boolean } };
    expect(after.me).toMatchObject({ eligible: true, resting: false });
    const adminFeed = (await owner.client.rpc('get_notifications')).data as { type: string; meta: Record<string, unknown>; link: string | null }[];
    const changed = adminFeed.find((n) => n.type === 'rest_changed')!;
    expect(changed.meta).toMatchObject({ status: 'ended', nickname: 'mem-r1', self: false });
    expect(changed.link).toBe('/admin?tab=members');
  });

  it('admin sets and clears rest directly; pending request is settled; member notified', async () => {
    await setFakeNow('2026-09-16T03:00:00Z');
    const { owner, member, groupId } = await setupGroup('휴식2', 'r2');
    const req = await member.client.rpc('request_rest', { p_reason: null });
    expect(req.error).toBeNull();

    expectRpcError(await member.client.rpc('set_member_rest', { p_group_id: groupId, p_user_id: owner.id, p_resting: true }), 'forbidden');
    const set = await owner.client.rpc('set_member_rest', { p_group_id: groupId, p_user_id: member.id, p_resting: true });
    expect(set.error).toBeNull();
    expectRpcError(await owner.client.rpc('set_member_rest', { p_group_id: groupId, p_user_id: member.id, p_resting: true }), 'already_resting');

    const r = await admin.from('rest_requests').select('status').eq('id', req.data).single();
    expect(r.data!.status).toBe('approved');
    const feed = (await member.client.rpc('get_notifications')).data as { type: string; meta: Record<string, unknown>; link: string | null }[];
    const n = feed.find((x) => x.type === 'rest_changed')!;
    expect(n.meta).toMatchObject({ status: 'started', groupName: '휴식2', self: true });
    expect(n.link).toBe('/profile');

    const clear = await owner.client.rpc('set_member_rest', { p_group_id: groupId, p_user_id: member.id, p_resting: false });
    expect(clear.error).toBeNull();
    const state = (await member.client.rpc('get_my_group_state')).data as { membership: { resting: boolean } };
    expect(state.membership.resting).toBe(false);
    expect((await admin.from('notifications').select('id').eq('user_id', member.id).eq('type', 'rest_changed')).data).toHaveLength(2);
  });

  it('member can cancel own pending request; reject keeps membership active', async () => {
    await setFakeNow('2026-09-16T03:00:00Z');
    const { owner, member } = await setupGroup('휴식3', 'r3');
    const r1 = await member.client.rpc('request_rest', { p_reason: 'x'.repeat(201) });
    expectRpcError(r1, 'invalid_input');
    const r2 = await member.client.rpc('request_rest', { p_reason: '  ' });
    expect(r2.error).toBeNull();
    expectRpcError(await owner.client.rpc('cancel_rest_request', { p_request_id: r2.data }), 'not_found');
    expect((await member.client.rpc('cancel_rest_request', { p_request_id: r2.data })).error).toBeNull();
    const r3 = await member.client.rpc('request_rest', { p_reason: '무릎 부상' });
    expect(r3.error).toBeNull();
    expect((await owner.client.rpc('review_rest_request', { p_request_id: r3.data, p_approve: false })).error).toBeNull();
    const state = (await member.client.rpc('get_my_group_state')).data as { membership: { resting: boolean }; pendingRestRequest: unknown };
    expect(state.membership.resting).toBe(false);
    expect(state.pendingRestRequest).toBeNull();
    // admin can see group requests, member only their own
    expect((await owner.client.from('rest_requests').select('id')).data!.length).toBeGreaterThanOrEqual(2);
    const stranger = await newMember('stranger');
    expect((await stranger.client.from('rest_requests').select('id')).data).toHaveLength(0);
  });
});
