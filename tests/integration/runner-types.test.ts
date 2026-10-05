import { describe, it, expect, beforeAll } from 'vitest';
import { adminClient, createTestUser, completeProfile, resetAll, setFakeNow, expectRpcError, type TestUser } from '@/test/supabase-test';
import { uploadEvidence, submit } from '@/test/records-helpers';
import { evaluate } from '@/lib/domain/penalty';
import type { RunnerType } from '@/lib/domain/runner-type';

const S = { targetMeters: 15000, freeMinMeters: 5000, penaltyPerKmWon: 10000, zeroKmPenaltyWon: 100000 };

async function newMember(label: string): Promise<TestUser> {
  const u = await createTestUser(label);
  await completeProfile(u, label);
  return u;
}

describe('app.evaluate matches the TS evaluate()', () => {
  const admin = adminClient();
  beforeAll(async () => { await resetAll(); });

  it('agrees on a table of inputs', async () => {
    const cases: Array<[RunnerType, number]> = [
      ['passion', 0], ['passion', 1], ['passion', 12300], ['passion', 14000], ['passion', 14999], ['passion', 15000], ['passion', 30000],
      ['free', 0], ['free', 2500], ['free', 4999], ['free', 5000], ['free', 15000],
      ['injured', 0], ['injured', 15000],
    ];
    for (const [type, total] of cases) {
      const { data, error } = await admin.rpc('test_evaluate', {
        p_type: type, p_total: total, p_target: S.targetMeters, p_free_min: S.freeMinMeters, p_per_km: S.penaltyPerKmWon, p_zero_won: S.zeroKmPenaltyWon,
      });
      expect(error, `${type}/${total}`).toBeNull();
      const row = (data as Array<{ outcome: string; penalty_won: number; ranked: boolean }>)[0];
      const ts = evaluate(type, total, S);
      expect({ outcome: row.outcome, penaltyWon: row.penalty_won, ranked: row.ranked }, `${type}/${total}`)
        .toEqual({ outcome: ts.outcome, penaltyWon: ts.penaltyWon, ranked: ts.ranked });
    }
  });
});

async function setupGroup(tag: string, opts: Partial<{ target: number; freeMin: number; perKm: number; zero: number }> = {}) {
  const owner = await newMember('own-' + tag);
  const g = (await owner.client.rpc('create_group', {
    p_name: '유형' + tag, p_target_meters: opts.target ?? 15000, p_penalty: null,
    p_free_min_meters: opts.freeMin ?? 5000, p_penalty_per_km_won: opts.perKm ?? 10000, p_zero_km_penalty_won: opts.zero ?? 100000,
  })).data![0];
  const join = async (label: string) => {
    const u = await newMember(label + '-' + tag);
    const req = await u.client.rpc('request_join', { p_code: g.invite_code });
    await owner.client.rpc('review_join_request', { p_request_id: req.data, p_approve: true });
    return u;
  };
  return { owner, join, groupId: g.group_id as string, inviteCode: g.invite_code as string };
}

async function approveAll(owner: TestUser, groupId: string) {
  const admin = adminClient();
  const { data } = await admin.from('running_records').select('id, version').eq('group_id', groupId).eq('status', 'pending');
  for (const r of data ?? []) {
    const res = await owner.client.rpc('review_record', { p_record_id: r.id, p_action: 'approve', p_reason: null, p_expected_version: r.version });
    expect(res.error).toBeNull();
  }
}

type DashRow = { userId: string; runnerType: string; eligible: boolean; rank: number | null; outcome: string; goalMeters: number | null; penaltyWon: number };
type Dash = {
  me: { eligible: boolean; runnerType: string; goalMeters: number | null; penaltyWon: number };
  members: DashRow[];
  week: { freeMinMeters: number; penaltyPerKmWon: number; zeroKmPenaltyWon: number; penalty: string | null };
};

describe('runner types: settings, snapshot, evaluation, finalize', () => {
  const admin = adminClient();
  beforeAll(async () => { await resetAll(); });

  it('create_group stores the numeric rules and defaults; old 3-arg call still works', async () => {
    await setFakeNow('2026-09-02T03:00:00Z');
    const { groupId, inviteCode } = await setupGroup('a', { target: 20000, freeMin: 6000, perKm: 5000, zero: 50000 });
    const s = (await admin.from('group_settings').select('*').eq('group_id', groupId).single()).data!;
    expect(s).toMatchObject({ target_meters: 20000, free_min_meters: 6000, penalty_per_km_won: 5000, zero_km_penalty_won: 50000, penalty: null });
    const w = (await admin.from('group_weeks').select('*').eq('group_id', groupId).single()).data!;
    expect(w).toMatchObject({ target_meters: 20000, free_min_meters: 6000, penalty_per_km_won: 5000, zero_km_penalty_won: 50000 });
    const inv = (await admin.rpc('lookup_invite', { p_code: inviteCode })).data![0];
    expect(inv).toMatchObject({ target_meters: 20000, free_min_meters: 6000, penalty_per_km_won: 5000, zero_km_penalty_won: 50000, penalty: null });

    const legacyOwner = await newMember('legacy');
    const legacy = await legacyOwner.client.rpc('create_group', { p_name: '옛호출', p_target_meters: 10000, p_penalty: '커피' });
    expect(legacy.error).toBeNull();
    const ls = (await admin.from('group_settings').select('*').eq('group_id', legacy.data![0].group_id).single()).data!;
    expect(ls).toMatchObject({ penalty: '커피', free_min_meters: 5000, penalty_per_km_won: 10000, zero_km_penalty_won: 100000 });
    const blank = await (await newMember('blank')).client.rpc('create_group', { p_name: '빈메모', p_target_meters: 10000, p_penalty: '   ' });
    expect(blank.error).toBeNull();
    expect((await admin.from('group_settings').select('penalty').eq('group_id', blank.data![0].group_id).single()).data!.penalty).toBeNull();
  });

  it('schedule_group_settings takes the numbers; invalid won is rejected', async () => {
    await setFakeNow('2026-09-02T03:00:00Z');
    const { owner, groupId } = await setupGroup('b');
    const ok = await owner.client.rpc('schedule_group_settings', { p_group_id: groupId, p_target_meters: 12000, p_penalty: '정산은 일요일', p_free_min_meters: 4000, p_penalty_per_km_won: 20000, p_zero_km_penalty_won: 150000 });
    expect(ok.error).toBeNull();
    expect(ok.data).toBe('2026-09-07');
    const next = (await admin.from('group_settings').select('*').eq('group_id', groupId).eq('effective_week_start', '2026-09-07').single()).data!;
    expect(next).toMatchObject({ target_meters: 12000, penalty: '정산은 일요일', free_min_meters: 4000, penalty_per_km_won: 20000, zero_km_penalty_won: 150000 });
    expectRpcError(await owner.client.rpc('schedule_group_settings', { p_group_id: groupId, p_target_meters: 12000, p_penalty_per_km_won: -1 }), 'invalid_input');
    expectRpcError(await owner.client.rpc('schedule_group_settings', { p_group_id: groupId, p_target_meters: 12000, p_free_min_meters: 0 }), 'invalid_input');
  });

  it('new members default to passion; admin changes type with immediate open-week effect; member notified', async () => {
    await setFakeNow('2026-09-02T03:00:00Z'); // prep week 08-31
    const { owner, join, groupId } = await setupGroup('c');
    const m = await join('mem');
    expect((await admin.from('memberships').select('runner_type').eq('user_id', m.id).single()).data!.runner_type).toBe('passion');

    await setFakeNow('2026-09-09T03:00:00Z'); // week 09-07, both eligible
    const before = (await m.client.rpc('get_week_dashboard', { p_group_id: groupId, p_week_start: '2026-09-07' })).data as Dash;
    expect(before.me).toMatchObject({ eligible: true, runnerType: 'passion', goalMeters: 15000, penaltyWon: 100000 });
    expect(before.week).toMatchObject({ freeMinMeters: 5000, penaltyPerKmWon: 10000, zeroKmPenaltyWon: 100000, penalty: null });

    expectRpcError(await m.client.rpc('set_member_runner_type', { p_group_id: groupId, p_user_id: owner.id, p_type: 'free' }), 'forbidden');
    expectRpcError(await owner.client.rpc('set_member_runner_type', { p_group_id: groupId, p_user_id: m.id, p_type: 'passion' }), 'same_runner_type');
    const stranger = await newMember('str-c');
    expectRpcError(await owner.client.rpc('set_member_runner_type', { p_group_id: groupId, p_user_id: stranger.id, p_type: 'free' }), 'not_member');

    expect((await owner.client.rpc('set_member_runner_type', { p_group_id: groupId, p_user_id: m.id, p_type: 'free' })).error).toBeNull();
    const asFree = (await m.client.rpc('get_week_dashboard', { p_group_id: groupId, p_week_start: '2026-09-07' })).data as Dash;
    expect(asFree.me).toMatchObject({ eligible: true, runnerType: 'free', goalMeters: 5000, penaltyWon: 100000 });
    const row = asFree.members.find((x) => x.userId === m.id)!;
    expect(row).toMatchObject({ runnerType: 'free', eligible: true, rank: null, outcome: 'provisional_fail' });
    const ownerRow = asFree.members.find((x) => x.userId === owner.id)!;
    expect(ownerRow).toMatchObject({ runnerType: 'passion', rank: 1 });

    expect((await owner.client.rpc('set_member_runner_type', { p_group_id: groupId, p_user_id: m.id, p_type: 'injured' })).error).toBeNull();
    const asInjured = (await m.client.rpc('get_week_dashboard', { p_group_id: groupId, p_week_start: '2026-09-07' })).data as Dash;
    expect(asInjured.me).toMatchObject({ eligible: false, runnerType: 'injured', goalMeters: null, penaltyWon: 0 });
    expect(asInjured.members.find((x) => x.userId === m.id)).toMatchObject({ eligible: false, rank: null, outcome: 'not_evaluated' });

    const state = (await m.client.rpc('get_my_group_state')).data as { membership: { runnerType: string } };
    expect(state.membership.runnerType).toBe('injured');

    const feed = (await m.client.rpc('get_notifications')).data as Array<{ type: string; meta: Record<string, unknown>; link: string | null }>;
    const changes = feed.filter((n) => n.type === 'runner_type_changed');
    expect(changes).toHaveLength(2);
    expect(changes[0].meta).toMatchObject({ type: 'injured', groupName: '유형c', nickname: 'mem-c' });
    expect(changes[0].link).toBe('/profile');
    // 관리자 본인 변경은 알림 없음
    expect((await owner.client.rpc('set_member_runner_type', { p_group_id: groupId, p_user_id: owner.id, p_type: 'free' })).error).toBeNull();
    expect((await admin.from('notifications').select('id').eq('user_id', owner.id).eq('type', 'runner_type_changed')).data).toHaveLength(0);

    // 다음 주 스냅샷도 현재 유형을 따른다
    await setFakeNow('2026-09-16T03:00:00Z');
    const next = (await m.client.rpc('get_week_dashboard', { p_group_id: groupId, p_week_start: '2026-09-14' })).data as Dash;
    expect(next.me).toMatchObject({ eligible: false, runnerType: 'injured' });
    expect(next.members.find((x) => x.userId === owner.id)).toMatchObject({ runnerType: 'free', rank: null });
  });

  it('finalize: per-type outcome, penalty_won, ranks only among passion; closing-week change does not alter snapshot', async () => {
    await setFakeNow('2026-09-02T03:00:00Z');
    const { owner, join, groupId } = await setupGroup('d');
    const p1 = await join('p1'); const p2 = await join('p2'); const fr = await join('fr'); const inj = await join('inj');
    await setFakeNow('2026-09-03T03:00:00Z');
    expect((await owner.client.rpc('set_member_runner_type', { p_group_id: groupId, p_user_id: fr.id, p_type: 'free' })).error).toBeNull();
    expect((await owner.client.rpc('set_member_runner_type', { p_group_id: groupId, p_user_id: inj.id, p_type: 'injured' })).error).toBeNull();

    await setFakeNow('2026-09-09T03:00:00Z'); // week 09-07 open
    await submit(p1, 20000, await uploadEvidence(p1, 1));   // passion success
    await submit(p2, 12300, await uploadEvidence(p2, 1));   // passion fail: 2.7km short → 30,000
    await submit(fr, 2500, await uploadEvidence(fr, 1));    // free fail: 2.5km short → 30,000
    await submit(inj, 9000, await uploadEvidence(inj, 1));  // injured: not evaluated
    // owner: passion 0m → 100,000
    await approveAll(owner, groupId);
    // 대기 기록 하나를 남겨 두어야 화요일 00:30 에 즉시 확정되지 않고 closing 상태가 된다 (12:00 에 만료됨)
    await setFakeNow('2026-09-13T10:00:00Z');
    await submit(p1, 1000, await uploadEvidence(p1, 1));

    await setFakeNow('2026-09-14T15:30:00Z'); // Tue 00:30 KST → closing
    await admin.rpc('run_week_maintenance');
    const week = (await admin.from('group_weeks').select('id, state').eq('group_id', groupId).eq('week_start', '2026-09-07').single()).data!;
    expect(week.state).toBe('closing');
    // closing 주에 유형을 바꿔도 스냅샷은 그대로
    expect((await owner.client.rpc('set_member_runner_type', { p_group_id: groupId, p_user_id: p2.id, p_type: 'injured' })).error).toBeNull();
    expect((await admin.from('week_members').select('runner_type, eligible').eq('week_id', week.id).eq('user_id', p2.id).single()).data).toMatchObject({ runner_type: 'passion', eligible: true });

    await setFakeNow('2026-09-15T03:30:00Z'); // Tue 12:30 KST → finalize
    await admin.rpc('run_week_maintenance');
    expect((await admin.from('group_weeks').select('state').eq('id', week.id).single()).data!.state).toBe('finalized');
    const rows = (await admin.from('weekly_results').select('user_id, outcome, penalty_won, rank, eligible').eq('week_id', week.id)).data!;
    const by = Object.fromEntries(rows.map((r) => [r.user_id, r]));
    expect(by[p1.id]).toMatchObject({ outcome: 'success', penalty_won: 0, rank: 1, eligible: true });
    expect(by[p2.id]).toMatchObject({ outcome: 'fail', penalty_won: 30000, rank: 2, eligible: true });
    expect(by[owner.id]).toMatchObject({ outcome: 'fail', penalty_won: 100000, rank: 3, eligible: true });
    expect(by[fr.id]).toMatchObject({ outcome: 'fail', penalty_won: 30000, rank: null, eligible: true });
    expect(by[inj.id]).toMatchObject({ outcome: 'not_evaluated', penalty_won: 0, rank: null, eligible: false });

    const dash = (await owner.client.rpc('get_week_dashboard', { p_group_id: groupId, p_week_start: '2026-09-07' })).data as Dash;
    const d = Object.fromEntries(dash.members.map((m) => [m.userId, m]));
    expect(d[p2.id]).toMatchObject({ penaltyWon: 30000, outcome: 'fail', rank: 2 });
    expect(d[fr.id]).toMatchObject({ penaltyWon: 30000, outcome: 'fail', rank: null });
    expect(dash.members.map((m) => m.userId).slice(0, 3)).toEqual([p1.id, p2.id, owner.id]); // 열정 순위순이 먼저

    const summary = (await owner.client.rpc('get_week_summary', { p_group_id: groupId, p_week_start: '2026-09-07' })).data as { penaltyTotalWon: number; successCount: number; evaluatedCount: number };
    expect(summary).toMatchObject({ penaltyTotalWon: 160000, successCount: 1, evaluatedCount: 4 });
  });

  it('legacy rest notifications still render through notification_view', async () => {
    await setFakeNow('2026-09-02T03:00:00Z');
    const { owner, groupId } = await setupGroup('e');
    const ins = await admin.from('notifications').insert({ user_id: owner.id, group_id: groupId, event_key: 'rest_result:legacy-1', type: 'rest_result', target_id: owner.id });
    expect(ins.error).toBeNull();
    const feed = (await owner.client.rpc('get_notifications')).data as Array<{ type: string; meta: Record<string, unknown>; link: string | null }>;
    const n = feed.find((x) => x.type === 'rest_result')!;
    expect(n.meta).toEqual({ legacy: true });
    expect(n.link).toBeNull();
  });
});
