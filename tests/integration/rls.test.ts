import { describe, it, expect, beforeAll } from 'vitest';
import { adminClient, createTestUser, completeProfile, resetAll, type TestUser } from '@/test/supabase-test';
import { TINY_JPEG } from '@/test/fixtures';

describe('RLS and storage policies', () => {
  const admin = adminClient();
  let a1: TestUser, a2: TestUser, b1: TestUser, outsider: TestUser;
  let groupA: string, groupB: string;

  beforeAll(async () => {
    await resetAll();
    [a1, a2, b1, outsider] = await Promise.all([
      createTestUser('a1'), createTestUser('a2'), createTestUser('b1'), createTestUser('out'),
    ]);
    await Promise.all([a1, a2, b1, outsider].map((u) => completeProfile(u)));
    groupA = (await admin.from('groups').insert({ name: 'A그룹' }).select().single()).data!.id;
    groupB = (await admin.from('groups').insert({ name: 'B그룹' }).select().single()).data!.id;
    await admin.from('memberships').insert([
      { group_id: groupA, user_id: a1.id, role: 'admin' },
      { group_id: groupA, user_id: a2.id, role: 'member' },
      { group_id: groupB, user_id: b1.id, role: 'admin' },
    ]);
    const week = (await admin.from('group_weeks')
      .insert({ group_id: groupA, week_start: '2026-09-07', target_meters: 10000, penalty: '없음' })
      .select().single()).data!;
    await admin.from('running_records').insert({
      group_id: groupA, user_id: a2.id, week_id: week.id, activity_date: '2026-09-08',
      distance_meters: 5000, submission_key: 'k',
    });
  });

  it('profiles are visible only within the same group', async () => {
    const seen = await a2.client.from('profiles').select('id').eq('id', a1.id);
    expect(seen.data).toHaveLength(1);
    const hidden = await outsider.client.from('profiles').select('id').eq('id', a1.id);
    expect(hidden.data).toHaveLength(0);
  });

  it('records are hidden from other groups and cannot be inserted directly', async () => {
    expect((await a2.client.from('running_records').select('id')).data).toHaveLength(1);
    expect((await b1.client.from('running_records').select('id')).data).toHaveLength(0);
    const ins = await a2.client.from('running_records').insert({
      group_id: groupA, user_id: a2.id, week_id: '00000000-0000-0000-0000-000000000000',
      activity_date: '2026-09-08', distance_meters: 1000, submission_key: 'x',
    });
    expect(ins.error).not.toBeNull();
  });

  it('profile update is limited to own row', async () => {
    const other = await a2.client.from('profiles').update({ nickname: '해킹' }).eq('id', a1.id).select();
    expect(other.data).toHaveLength(0);
    const mine = await a2.client.from('profiles').update({ nickname: '나야' }).eq('id', a2.id).select();
    expect(mine.data?.[0].nickname).toBe('나야');
  });

  it('evidence uploads are limited to own folder in own group', async () => {
    const ok = await a2.client.storage.from('evidence').upload(`${groupA}/${a2.id}/1.jpg`, TINY_JPEG, { contentType: 'image/jpeg' });
    expect(ok.error).toBeNull();
    const wrongGroup = await outsider.client.storage.from('evidence').upload(`${groupA}/${outsider.id}/2.jpg`, TINY_JPEG, { contentType: 'image/jpeg' });
    expect(wrongGroup.error).not.toBeNull();
    const wrongUser = await a1.client.storage.from('evidence').upload(`${groupA}/${a2.id}/3.jpg`, TINY_JPEG, { contentType: 'image/jpeg' });
    expect(wrongUser.error).not.toBeNull();
    const dl = await b1.client.storage.from('evidence').download(`${groupA}/${a2.id}/1.jpg`);
    expect(dl.error).not.toBeNull();
    const dlOk = await a1.client.storage.from('evidence').download(`${groupA}/${a2.id}/1.jpg`);
    expect(dlOk.error).toBeNull();
  });

  it('avatars are readable by group mates only', async () => {
    const up = await a1.client.storage.from('avatars').upload(`${a1.id}/avatar.jpg`, TINY_JPEG, { contentType: 'image/jpeg' });
    expect(up.error).toBeNull();
    expect((await a2.client.storage.from('avatars').download(`${a1.id}/avatar.jpg`)).error).toBeNull();
    expect((await b1.client.storage.from('avatars').download(`${a1.id}/avatar.jpg`)).error).not.toBeNull();
  });
});
