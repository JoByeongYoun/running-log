import { describe, it, expect, beforeAll } from 'vitest';
import { adminClient, createTestUser, completeProfile, resetAll, setFakeNow, expectRpcError, type TestUser } from '@/test/supabase-test';
import { uploadEvidence, submit } from '@/test/records-helpers';

async function member(label: string) { const u = await createTestUser(label); await completeProfile(u, label); return u; }

describe('records: upload, submit, edit, review, comments', () => {
  const admin = adminClient();
  let owner: TestUser, m1: TestUser, m2: TestUser, groupId: string;

  beforeAll(async () => {
    await resetAll();
    await setFakeNow('2026-09-09T03:00:00Z'); // Wed 12:00 KST
    owner = await member('owner');
    const g = (await owner.client.rpc('create_group', { p_name: '기록그룹', p_target_meters: 10000, p_penalty: '없음' })).data![0];
    groupId = g.group_id;
    m1 = await member('m1'); m2 = await member('m2');
    for (const u of [m1, m2]) {
      const r = (await u.client.rpc('request_join', { p_code: g.invite_code })).data as string;
      await owner.client.rpc('review_join_request', { p_request_id: r, p_approve: true });
    }
  });

  it('submits with photos, idempotent by submission key', async () => {
    const ups = await uploadEvidence(m1, 2);
    const key = crypto.randomUUID();
    const first = await submit(m1, 5250, ups, key);
    expect(first.error).toBeNull();
    const again = await submit(m1, 5250, ups, key);
    expect(again.data).toBe(first.data);
    const rec = await admin.from('running_records').select('*').eq('id', first.data).single();
    expect(rec.data).toMatchObject({ status: 'pending', activity_date: '2026-09-09', distance_meters: 5250, version: 1 });
    expect((await admin.from('record_photos').select('*').eq('record_id', first.data)).data).toHaveLength(2);
    expect((await admin.from('pending_uploads').select('*').eq('user_id', m1.id)).data).toHaveLength(0);
    expect((await admin.from('notifications').select('*').eq('user_id', owner.id).like('event_key', 'record_submitted:%')).data).toHaveLength(1);
  });

  it('validates photos and ownership', async () => {
    expectRpcError(await submit(m1, 1000, []), 'photos_required');
    const six = await uploadEvidence(m1, 6);
    expectRpcError(await submit(m1, 1000, six), 'too_many_photos');
    const other = await uploadEvidence(m2, 1);
    expectRpcError(await submit(m1, 1000, other), 'upload_not_owned');
    const slot = (await m1.client.rpc('create_upload_slot', { p_content_type: 'image/jpeg', p_byte_size: 100 })).data![0];
    expectRpcError(await submit(m1, 1000, [slot.upload_id]), 'upload_not_ready');
    expectRpcError(await m1.client.rpc('create_upload_slot', { p_content_type: 'image/gif', p_byte_size: 100 }), 'invalid_content_type');
    expectRpcError(await m1.client.rpc('create_upload_slot', { p_content_type: 'image/jpeg', p_byte_size: 10485761 }), 'file_too_large');
  });

  it('date_changed guard and week boundary', async () => {
    const ups = await uploadEvidence(m1, 1);
    const stale = await m1.client.rpc('submit_record', { p_submission_key: crypto.randomUUID(), p_distance_meters: 1000, p_memo: null, p_upload_ids: ups, p_client_date: '2026-09-08' });
    expectRpcError(stale, 'date_changed');
    await setFakeNow('2026-09-13T14:59:00Z'); // Sunday 23:59 KST
    const sun = await submit(m1, 1000, await uploadEvidence(m1, 1));
    const sunRec = await admin.from('running_records').select('activity_date, group_weeks(week_start)').eq('id', sun.data).single();
    expect(sunRec.data).toMatchObject({ activity_date: '2026-09-13', group_weeks: { week_start: '2026-09-07' } });
    await setFakeNow('2026-09-13T15:00:00Z'); // Monday 00:00 KST
    const mon = await submit(m1, 1000, await uploadEvidence(m1, 1));
    const monRec = await admin.from('running_records').select('activity_date, group_weeks(week_start)').eq('id', mon.data).single();
    expect(monRec.data).toMatchObject({ activity_date: '2026-09-14', group_weeks: { week_start: '2026-09-14' } });
    await setFakeNow('2026-09-09T03:00:00Z');
  });

  it('review: approve, stale version, self-approve, reject reason, unapprove, permissions', async () => {
    const rec = (await submit(m2, 3000, await uploadEvidence(m2, 1))).data as string;
    expectRpcError(await m1.client.rpc('review_record', { p_record_id: rec, p_action: 'approve', p_reason: null, p_expected_version: 1 }), 'forbidden');
    // author edits before admin approves with old version
    const photos = await admin.from('record_photos').select('id').eq('record_id', rec);
    const upd = await m2.client.rpc('update_record', { p_record_id: rec, p_distance_meters: 4000, p_memo: '수정', p_keep_photo_ids: photos.data!.map((p) => p.id), p_upload_ids: [], p_expected_version: 1 });
    expect(upd.error).toBeNull();
    expectRpcError(await owner.client.rpc('review_record', { p_record_id: rec, p_action: 'approve', p_reason: null, p_expected_version: 1 }), 'stale_version');
    expect((await owner.client.rpc('review_record', { p_record_id: rec, p_action: 'approve', p_reason: null, p_expected_version: 2 })).error).toBeNull();
    expect((await admin.from('running_records').select('status').eq('id', rec).single()).data!.status).toBe('approved');
    expect((await admin.from('notifications').select('*').eq('user_id', m2.id).like('event_key', 'record_review:%')).data).toHaveLength(1);
    // author cannot edit approved
    expectRpcError(await m2.client.rpc('delete_record', { p_record_id: rec }), 'invalid_status');
    // unapprove requires reason
    expectRpcError(await owner.client.rpc('review_record', { p_record_id: rec, p_action: 'unapprove', p_reason: '', p_expected_version: 2 }), 'reason_required');
    expect((await owner.client.rpc('review_record', { p_record_id: rec, p_action: 'unapprove', p_reason: '사진 불명확', p_expected_version: 2 })).error).toBeNull();
    expectRpcError(await owner.client.rpc('review_record', { p_record_id: rec, p_action: 'reject', p_reason: null, p_expected_version: 2 }), 'reason_required');
    expect((await owner.client.rpc('review_record', { p_record_id: rec, p_action: 'reject', p_reason: '거리 불일치', p_expected_version: 2 })).error).toBeNull();
    // rejected → author resubmits → pending v3
    const re = await m2.client.rpc('update_record', { p_record_id: rec, p_distance_meters: 3500, p_memo: null, p_keep_photo_ids: photos.data!.map((p) => p.id), p_upload_ids: [], p_expected_version: 2 });
    expect(re.error).toBeNull();
    expect((await admin.from('running_records').select('status, version').eq('id', rec).single()).data).toMatchObject({ status: 'pending', version: 3 });
    // self approval by admin
    const own = (await submit(owner, 2000, await uploadEvidence(owner, 1))).data as string;
    expect((await owner.client.rpc('review_record', { p_record_id: own, p_action: 'approve', p_reason: null, p_expected_version: 1 })).error).toBeNull();
    expect((await admin.from('record_reviews').select('*').eq('record_id', own)).data).toHaveLength(2);
  });

  it('edit window closes the next day', async () => {
    const rec = (await submit(m1, 1000, await uploadEvidence(m1, 1))).data as string;
    await setFakeNow('2026-09-10T03:00:00Z');
    expectRpcError(await m1.client.rpc('delete_record', { p_record_id: rec }), 'edit_window_closed');
    await setFakeNow('2026-09-09T03:00:00Z');
  });

  it('delete returns photo paths and removes record', async () => {
    const rec = (await submit(m1, 1000, await uploadEvidence(m1, 2))).data as string;
    const del = await m1.client.rpc('delete_record', { p_record_id: rec });
    expect(del.error).toBeNull();
    expect(del.data).toHaveLength(2);
    expect((await admin.from('running_records').select('id').eq('id', rec)).data).toHaveLength(0);
  });

  it('comments: add, order, delete permissions, hidden after leaving', async () => {
    const rec = (await submit(m1, 1000, await uploadEvidence(m1, 1))).data as string;
    const c1 = (await m2.client.rpc('add_comment', { p_record_id: rec, p_body: '첫 댓글' })).data as string;
    const c2 = (await m1.client.rpc('add_comment', { p_record_id: rec, p_body: '둘째' })).data as string;
    expectRpcError(await m1.client.rpc('add_comment', { p_record_id: rec, p_body: 'x'.repeat(1001) }), 'invalid_input');
    const list = await m1.client.from('comments').select('id').eq('record_id', rec).order('created_at');
    expect(list.data!.map((c) => c.id)).toEqual([c1, c2]);
    expectRpcError(await m1.client.rpc('delete_comment', { p_comment_id: c1 }), 'forbidden');
    expect((await owner.client.rpc('delete_comment', { p_comment_id: c1 })).error).toBeNull();
    expect((await admin.from('comments').select('body, deleted_by').eq('id', c1).single()).data).toMatchObject({ body: '', deleted_by: owner.id });
    // m2 leaves → cannot see comments
    await m2.client.rpc('leave_group');
    expect((await m2.client.from('comments').select('id').eq('record_id', rec)).data).toHaveLength(0);
  });
});
