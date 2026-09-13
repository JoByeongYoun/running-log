import { describe, it, expect, beforeAll } from 'vitest';
import { adminClient, createTestUser, completeProfile, resetAll, setFakeNow, type TestUser } from '@/test/supabase-test';
import { uploadEvidence, submit } from '@/test/records-helpers';

async function member(label: string) { const u = await createTestUser(label); await completeProfile(u, label); return u; }

describe('push subscriptions and payload', () => {
  const admin = adminClient();
  let owner: TestUser, m1: TestUser;

  beforeAll(async () => {
    await resetAll();
    await setFakeNow('2026-09-09T03:00:00Z');
    owner = await member('owner');
    const g = (await owner.client.rpc('create_group', { p_name: '푸시그룹', p_target_meters: 5000, p_penalty: '없음' })).data![0];
    m1 = await member('m1');
    const r = (await m1.client.rpc('request_join', { p_code: g.invite_code })).data as string;
    await owner.client.rpc('review_join_request', { p_request_id: r, p_approve: true });
  });

  it('save_push_subscription upserts by endpoint and RLS hides other users rows', async () => {
    const ep = 'https://push.example/ep-1';
    expect((await m1.client.rpc('save_push_subscription', { p_endpoint: ep, p_p256dh: 'k1', p_auth: 'a1', p_user_agent: 'ua' })).error).toBeNull();
    expect((await m1.client.rpc('save_push_subscription', { p_endpoint: ep, p_p256dh: 'k2', p_auth: 'a2', p_user_agent: 'ua' })).error).toBeNull();
    const mine = await m1.client.from('push_subscriptions').select('endpoint, p256dh, user_id');
    expect(mine.data).toEqual([{ endpoint: ep, p256dh: 'k2', user_id: m1.id }]);
    const others = await owner.client.from('push_subscriptions').select('endpoint');
    expect(others.data).toEqual([]);
    await owner.client.from('push_subscriptions').delete().eq('endpoint', ep);
    expect((await admin.from('push_subscriptions').select('endpoint')).data).toHaveLength(1);
    // re-registering the same endpoint from another account moves ownership
    expect((await owner.client.rpc('save_push_subscription', { p_endpoint: ep, p_p256dh: 'k3', p_auth: 'a3', p_user_agent: null })).error).toBeNull();
    expect((await admin.from('push_subscriptions').select('user_id').eq('endpoint', ep)).data).toEqual([{ user_id: owner.id }]);
    await m1.client.from('push_subscriptions').delete().eq('endpoint', ep); // no-op under RLS
    expect((await admin.from('push_subscriptions').select('endpoint')).data).toHaveLength(1);
  });

  it('get_push_payload matches get_notifications and is service-role only', async () => {
    const rec = (await submit(m1, 6000, await uploadEvidence(m1, 1))).data as string;
    const feed = (await owner.client.rpc('get_notifications', { p_limit: 20 })).data as Array<Record<string, unknown> & { id: string; type: string }>;
    const item = feed.find((n) => n.type === 'record_submitted')!;
    const payload = (await admin.rpc('get_push_payload', { p_notification_id: item.id })).data as { userId: string; view: Record<string, unknown> };
    expect(payload.userId).toBe(owner.id);
    expect(payload.view).toEqual(item);
    expect(payload.view.link).toBe(`/records/${rec}`);
    expect((await admin.rpc('get_push_payload', { p_notification_id: '00000000-0000-0000-0000-000000000000' })).data).toBeNull();
    const denied = await owner.client.rpc('get_push_payload', { p_notification_id: item.id });
    expect(denied.error).not.toBeNull();
  });

  it('notification insert succeeds whether or not webhook settings exist', async () => {
    await admin.rpc('test_set_push_settings', { p_url: null, p_secret: null });
    const before = (await admin.from('notifications').select('id', { count: 'exact', head: true })).count ?? 0;
    const rec1 = (await submit(m1, 7000, await uploadEvidence(m1, 1))).data as string;
    expect(rec1).toBeTruthy();
    await admin.rpc('test_set_push_settings', { p_url: 'http://127.0.0.1:9/api/push/dispatch', p_secret: 'test' });
    const rec2 = (await submit(m1, 8000, await uploadEvidence(m1, 1))).data as string;
    expect(rec2).toBeTruthy();
    const after = (await admin.from('notifications').select('id', { count: 'exact', head: true })).count ?? 0;
    expect(after - before).toBe(2);
    await admin.rpc('test_set_push_settings', { p_url: null, p_secret: null });
  });
});
