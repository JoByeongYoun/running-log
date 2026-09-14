import { describe, it, expect, beforeAll } from 'vitest';
import { adminClient, createTestUser, completeProfile, resetAll, setFakeNow } from '@/test/supabase-test';
import { uploadEvidence, submit } from '@/test/records-helpers';

async function member(label: string) { const u = await createTestUser(label); await completeProfile(u, label); return u; }

describe('evidence photo retention', () => {
  const admin = adminClient();
  let owner: Awaited<ReturnType<typeof member>>;
  let recId: string;
  let paths: string[];

  beforeAll(async () => {
    await resetAll();
    await setFakeNow('2026-09-02T03:00:00Z'); // Wed of prep week
    owner = await member('owner');
    await owner.client.rpc('create_group', { p_name: '보관그룹', p_target_meters: 10000, p_penalty: '벌금' });
    await setFakeNow('2026-09-09T03:00:00Z'); // Wed of week 09-07
    await admin.rpc('run_week_maintenance');
    recId = (await submit(owner, 12000, await uploadEvidence(owner, 2))).data as string;
    await owner.client.rpc('review_record', { p_record_id: recId, p_action: 'approve', p_reason: null, p_expected_version: 1 });
    paths = (await admin.from('record_photos').select('storage_path').eq('record_id', recId)).data!.map((p) => p.storage_path);
    expect(paths).toHaveLength(2);
    await setFakeNow('2026-09-15T03:00:00Z'); // Tuesday 12:00 KST → week finalized
    await admin.rpc('run_week_maintenance');
    expect((await admin.from('group_weeks').select('state').eq('week_start', '2026-09-07').single()).data!.state).toBe('finalized');
  });

  it('is not callable by authenticated users', async () => {
    const res = await owner.client.rpc('purge_expired_photos', { p_keep: '0 weeks' });
    expect(res.error).not.toBeNull();
  });

  it('keeps photos while the week is within the retention window', async () => {
    await setFakeNow('2026-11-09T03:00:00Z'); // 7 weeks 6 days after finalize
    const res = await admin.rpc('purge_expired_photos', { p_keep: '8 weeks' });
    expect(res.error).toBeNull();
    expect(res.data).toEqual([]);
    expect((await admin.from('record_photos').select('id').eq('record_id', recId)).data).toHaveLength(2);
  });

  it('purges photos after the window, keeps the record, returns storage paths', async () => {
    await setFakeNow('2026-11-11T03:00:00Z'); // 8 weeks 1 day after finalize
    const res = await admin.rpc('purge_expired_photos', { p_keep: '8 weeks' });
    expect(res.error).toBeNull();
    expect([...(res.data as string[])].sort()).toEqual([...paths].sort());
    expect((await admin.from('record_photos').select('id').eq('record_id', recId)).data).toHaveLength(0);
    const rec = (await admin.from('running_records').select('status, distance_meters, photos_purged_at').eq('id', recId).single()).data!;
    expect(rec).toMatchObject({ status: 'approved', distance_meters: 12000 });
    expect(rec.photos_purged_at).not.toBeNull();
    // objects can be removed with the returned paths (what the cron route does)
    const rm = await admin.storage.from('evidence').remove(res.data as string[]);
    expect(rm.error).toBeNull();
    expect(rm.data).toHaveLength(2);
    // second run is a no-op
    expect((await admin.rpc('purge_expired_photos', { p_keep: '8 weeks' })).data).toEqual([]);
  });
});
