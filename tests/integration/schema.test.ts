import { describe, it, expect, beforeAll } from 'vitest';
import { adminClient, createTestUser, resetAll, setFakeNow } from '@/test/supabase-test';

describe('schema constraints and time helpers', () => {
  const admin = adminClient();
  beforeAll(async () => {
    await resetAll();
  });

  it('allows only one active membership per user', async () => {
    const u = await createTestUser('schema');
    const { data: g1 } = await admin.from('groups').insert({ name: '그룹1' }).select().single();
    const { data: g2 } = await admin.from('groups').insert({ name: '그룹2' }).select().single();
    const first = await admin.from('memberships').insert({ group_id: g1!.id, user_id: u.id, role: 'admin' });
    expect(first.error).toBeNull();
    const second = await admin.from('memberships').insert({ group_id: g2!.id, user_id: u.id, role: 'admin' });
    expect(second.error?.code).toBe('23505');
  });

  it('allows only one active admin per group', async () => {
    const a = await createTestUser('adm1');
    const b = await createTestUser('adm2');
    const { data: g } = await admin.from('groups').insert({ name: '관리자그룹' }).select().single();
    expect((await admin.from('memberships').insert({ group_id: g!.id, user_id: a.id, role: 'admin' })).error).toBeNull();
    const dup = await admin.from('memberships').insert({ group_id: g!.id, user_id: b.id, role: 'admin' });
    expect(dup.error?.code).toBe('23505');
  });

  it('rejects distance over 500km', async () => {
    const u = await createTestUser('dist');
    const { data: g } = await admin.from('groups').insert({ name: '거리그룹' }).select().single();
    const { data: w } = await admin
      .from('group_weeks')
      .insert({ group_id: g!.id, week_start: '2026-09-07', target_meters: 10000, penalty: '없음' })
      .select()
      .single();
    const res = await admin.from('running_records').insert({
      group_id: g!.id, user_id: u.id, week_id: w!.id, activity_date: '2026-09-08',
      distance_meters: 500001, submission_key: 'k1',
    });
    expect(res.error?.code).toBe('23514');
  });

  it('computes KST week boundaries', async () => {
    expect((await admin.rpc('app_week_start_of', { p: '2026-09-13T14:59:00Z' })).data).toBe('2026-09-07');
    expect((await admin.rpc('app_week_start_of', { p: '2026-09-13T15:00:00Z' })).data).toBe('2026-09-14');
    const { data: deadline } = await admin.rpc('app_week_close_deadline', { p: '2026-09-07' });
    expect(new Date(deadline as string).toISOString()).toBe('2026-09-14T03:00:00.000Z');
  });

  it('fake clock drives app.now()', async () => {
    await setFakeNow('2026-09-14T02:30:00Z');
    const { data } = await admin.rpc('app_now');
    expect(new Date(data as string).toISOString()).toBe('2026-09-14T02:30:00.000Z');
    await setFakeNow(null);
    const { data: real } = await admin.rpc('app_now');
    expect(Math.abs(Date.now() - new Date(real as string).getTime())).toBeLessThan(60_000);
  });
});
