import { describe, it, expect, beforeAll } from 'vitest';
import { adminClient, createTestUser, completeProfile, resetAll, setFakeNow, expectRpcError, type TestUser } from '@/test/supabase-test';
import { uploadEvidence, submit } from '@/test/records-helpers';

async function member(label: string) { const u = await createTestUser(label); await completeProfile(u, label); return u; }

describe('record cover photo (대표 사진)', () => {
  const admin = adminClient();
  let owner: TestUser, m1: TestUser, m2: TestUser, recordId: string;

  beforeAll(async () => {
    await resetAll();
    await setFakeNow('2026-09-09T03:00:00Z');
    owner = await member('owner');
    const g = (await owner.client.rpc('create_group', { p_name: '커버그룹', p_target_meters: 10000, p_penalty: '없음' })).data![0];
    m1 = await member('m1'); m2 = await member('m2');
    for (const u of [m1, m2]) {
      const r = (await u.client.rpc('request_join', { p_code: g.invite_code })).data as string;
      await owner.client.rpc('review_join_request', { p_request_id: r, p_approve: true });
    }
    recordId = (await submit(m1, 5000, await uploadEvidence(m1, 3))).data as string;
  });

  async function covers() {
    const { data } = await admin.from('record_photos').select('order_index, is_cover').eq('record_id', recordId).order('order_index');
    return data!.map((p) => p.is_cover);
  }

  it('owner sets, moves and clears the cover; version and status stay', async () => {
    expect((await m1.client.rpc('set_record_cover', { p_record_id: recordId, p_order_index: 1 })).error).toBeNull();
    expect(await covers()).toEqual([false, true, false]);
    expect((await m1.client.rpc('set_record_cover', { p_record_id: recordId, p_order_index: 2 })).error).toBeNull();
    expect(await covers()).toEqual([false, false, true]);
    expect((await m1.client.rpc('set_record_cover', { p_record_id: recordId })).error).toBeNull();
    expect(await covers()).toEqual([false, false, false]);
    const rec = (await admin.from('running_records').select('version, status').eq('id', recordId).single()).data;
    expect(rec).toMatchObject({ version: 1, status: 'pending' });
  });

  it('rejects other members, admins and bad indexes', async () => {
    expectRpcError(await m2.client.rpc('set_record_cover', { p_record_id: recordId, p_order_index: 0 }), 'forbidden');
    expectRpcError(await owner.client.rpc('set_record_cover', { p_record_id: recordId, p_order_index: 0 }), 'forbidden');
    expectRpcError(await m1.client.rpc('set_record_cover', { p_record_id: recordId, p_order_index: 9 }), 'invalid_input');
    expectRpcError(await m1.client.rpc('set_record_cover', { p_record_id: crypto.randomUUID(), p_order_index: 0 }), 'not_found');
  });

  it('cover survives update_record when the photo is kept', async () => {
    await m1.client.rpc('set_record_cover', { p_record_id: recordId, p_order_index: 2 });
    const ids = (await admin.from('record_photos').select('id, order_index').eq('record_id', recordId).order('order_index')).data!.map((p) => p.id);
    // 2번(커버)을 맨 앞으로, 0번 삭제
    const res = await m1.client.rpc('update_record', { p_record_id: recordId, p_distance_meters: 5000, p_memo: '', p_keep_photo_ids: [ids[2], ids[1]], p_upload_ids: [], p_expected_version: 1 });
    expect(res.error).toBeNull();
    expect(await covers()).toEqual([true, false]);
  });
});
