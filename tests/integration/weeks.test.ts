import { describe, it, expect, beforeAll } from 'vitest';
import { adminClient, createTestUser, completeProfile, resetAll, setFakeNow, expectRpcError } from '@/test/supabase-test';
import { uploadEvidence, submit } from '@/test/records-helpers';

async function member(label: string) { const u = await createTestUser(label); await completeProfile(u, label); return u; }

async function setupGroup(admin = adminClient()) {
  await setFakeNow('2026-09-02T03:00:00Z'); // Wed of week 08-31 (prep week)
  const owner = await member('owner');
  const g = (await owner.client.rpc('create_group', { p_name: '집계그룹', p_target_meters: 10000, p_penalty: '벌금 1만원' })).data![0];
  const a = await member('aa'); const b = await member('bb');
  for (const u of [a, b]) {
    const r = (await u.client.rpc('request_join', { p_code: g.invite_code })).data as string;
    await owner.client.rpc('review_join_request', { p_request_id: r, p_approve: true });
  }
  await setFakeNow('2026-09-09T03:00:00Z'); // Wed of week 09-07 (all three eligible)
  const weekId = (await admin.rpc('run_week_maintenance')).data.weekIds; void weekId;
  const week = (await admin.from('group_weeks').select('id').eq('group_id', g.group_id).eq('week_start', '2026-09-07').single()).data!.id;
  return { owner, a, b, groupId: g.group_id, weekId: week };
}

describe('weekly closing and finalization', () => {
  const admin = adminClient(); void admin;
  let ctx: Awaited<ReturnType<typeof setupGroup>>;
  let recA: string, recB: string;
  beforeAll(async () => { await resetAll(); ctx = await setupGroup(admin); });

  it('eligibility snapshot: members joined in prep week are eligible next week', async () => {
    const rows = await admin.from('week_members').select('user_id, eligible, joined_this_week').eq('week_id', ctx.weekId);
    expect(rows.data!.every((r) => r.eligible && !r.joined_this_week)).toBe(true);
    expect(rows.data).toHaveLength(3);
  });

  it('Sunday record pending → Monday 00:30 closing with one reminder; 11:30 second reminder', async () => {
    await setFakeNow('2026-09-13T14:00:00Z'); // Sunday 23:00 KST
    recA = (await submit(ctx.a, 12000, await uploadEvidence(ctx.a, 1))).data as string;
    recB = (await submit(ctx.b, 4000, await uploadEvidence(ctx.b, 1))).data as string;
    await setFakeNow('2026-09-13T15:30:00Z'); // Monday 00:30 KST
    await admin.rpc('run_week_maintenance');
    await admin.rpc('run_week_maintenance');
    expect((await admin.from('group_weeks').select('state').eq('id', ctx.weekId).single()).data!.state).toBe('closing');
    const rem = await admin.from('notifications').select('event_key').eq('user_id', ctx.owner.id).like('event_key', 'review_reminder:%');
    expect(rem.data!.map((r) => r.event_key.slice(-3))).toEqual([':00']);
    // new week exists for dashboard
    expect((await admin.from('group_weeks').select('id').eq('group_id', ctx.groupId).eq('week_start', '2026-09-14')).data).toHaveLength(1);
    await setFakeNow('2026-09-14T02:30:00Z'); // Monday 11:30 KST
    await admin.rpc('run_week_maintenance');
    const rem2 = await admin.from('notifications').select('event_key').eq('user_id', ctx.owner.id).like('event_key', 'review_reminder:%');
    expect(rem2.data).toHaveLength(2);
    // new submissions go to the new week, not the closing one
    const mon = (await submit(ctx.a, 1000, await uploadEvidence(ctx.a, 1))).data as string;
    expect((await admin.from('running_records').select('week_id').eq('id', mon).single()).data!.week_id).not.toBe(ctx.weekId);
  });

  it('11:59 approval of Sunday record counts for last week; last pending processed → immediate finalize', async () => {
    await setFakeNow('2026-09-14T02:59:00Z'); // Monday 11:59 KST
    expect((await ctx.owner.client.rpc('review_record', { p_record_id: recA, p_action: 'approve', p_reason: null, p_expected_version: 1 })).error).toBeNull();
    expect((await admin.from('group_weeks').select('state').eq('id', ctx.weekId).single()).data!.state).toBe('closing');
    expect((await ctx.owner.client.rpc('review_record', { p_record_id: recB, p_action: 'reject', p_reason: '사진 불명확', p_expected_version: 1 })).error).toBeNull();
    const w = (await admin.from('group_weeks').select('*').eq('id', ctx.weekId).single()).data!;
    expect(w.state).toBe('finalized');
    expect(w.group_name_snapshot).toBe('집계그룹');
    expect(w.group_total_meters).toBe(12000);
    const results = await admin.from('weekly_results').select('user_id, total_meters, rank, outcome, eligible').eq('week_id', ctx.weekId);
    const by = Object.fromEntries(results.data!.map((r) => [r.user_id, r]));
    expect(by[ctx.a.id]).toMatchObject({ total_meters: 12000, rank: 1, outcome: 'success' });
    expect(by[ctx.b.id]).toMatchObject({ total_meters: 0, rank: 2, outcome: 'fail' });
    expect(by[ctx.owner.id]).toMatchObject({ total_meters: 0, rank: 2, outcome: 'fail' });
    expect((await admin.from('notifications').select('*').like('event_key', `week_final:${ctx.weekId}`)).data).toHaveLength(3);
    // after finalize nothing can change
    expectRpcError(await ctx.owner.client.rpc('review_record', { p_record_id: recA, p_action: 'unapprove', p_reason: 'x', p_expected_version: 1 }), 'week_finalized');
  });

  it('12:00 deadline expires pending records and finalizes; 0km eligible members fail', async () => {
    // week of 09-14: b submits Sunday, nobody reviews
    await setFakeNow('2026-09-20T10:00:00Z');
    const rec = (await submit(ctx.b, 20000, await uploadEvidence(ctx.b, 1))).data as string;
    await setFakeNow('2026-09-21T03:00:00Z'); // Monday 12:00 KST
    // approval attempt at deadline is refused
    expectRpcError(await ctx.owner.client.rpc('review_record', { p_record_id: rec, p_action: 'approve', p_reason: null, p_expected_version: 1 }), 'review_closed');
    const res = await admin.rpc('run_week_maintenance');
    expect(res.data.finalized).toBe(1);
    expect((await admin.from('running_records').select('status').eq('id', rec).single()).data!.status).toBe('expired');
    const w = (await admin.from('group_weeks').select('id, state').eq('group_id', ctx.groupId).eq('week_start', '2026-09-14').single()).data!;
    expect(w.state).toBe('finalized');
    const results = await admin.from('weekly_results').select('outcome').eq('week_id', w.id);
    expect(results.data!.map((r) => r.outcome)).toEqual(['fail', 'fail', 'fail']);
    expect((await admin.from('notifications').select('*').eq('user_id', ctx.b.id).like('event_key', 'record_expired:%')).data).toHaveLength(1);
  });

  it('snapshot survives renames; second maintenance run is a no-op; archived group weeks still close', async () => {
    await ctx.owner.client.rpc('rename_group', { p_group_id: ctx.groupId, p_name: '새이름' });
    expect((await admin.from('group_weeks').select('group_name_snapshot').eq('id', ctx.weekId).single()).data!.group_name_snapshot).toBe('집계그룹');
    const again = await admin.rpc('run_week_maintenance');
    expect(again.data.finalized).toBe(0);
    // tie ranking 1,2,2,4 via dashboard is covered in dashboard tests
    // archive: everyone leaves
    await ctx.a.client.rpc('leave_group'); await ctx.b.client.rpc('leave_group'); await ctx.owner.client.rpc('leave_group');
    await setFakeNow('2026-09-28T03:00:00Z');
    const r = await admin.rpc('run_week_maintenance');
    expect(r.data.finalized).toBe(1);
    expect(r.data.createdWeeks).toBe(0);
  });
});
