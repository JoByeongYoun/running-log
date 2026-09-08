import { describe, it, expect, beforeAll } from 'vitest';
import { adminClient, createTestUser, completeProfile, resetAll, setFakeNow, type TestUser } from '@/test/supabase-test';
import { uploadEvidence, submit } from '@/test/records-helpers';

async function member(label: string) { const u = await createTestUser(label); await completeProfile(u, label); return u; }

describe('notifications and weekly summary', () => {
  const admin = adminClient();
  let owner: TestUser, m1: TestUser, m2: TestUser, groupId: string, code: string;

  beforeAll(async () => {
    await resetAll();
    await setFakeNow('2026-09-02T03:00:00Z');
    owner = await member('owner');
    const g = (await owner.client.rpc('create_group', { p_name: '알림그룹', p_target_meters: 5000, p_penalty: '없음' })).data![0];
    groupId = g.group_id; code = g.invite_code;
    m1 = await member('m1'); m2 = await member('m2');
    for (const u of [m1, m2]) {
      const r = (await u.client.rpc('request_join', { p_code: code })).data as string;
      await owner.client.rpc('review_join_request', { p_request_id: r, p_approve: true });
    }
  });

  it('feed carries links and meta, dedupes by event key, and read marking is per user', async () => {
    await setFakeNow('2026-09-09T03:00:00Z');
    const rec = (await submit(m1, 6000, await uploadEvidence(m1, 1))).data as string;
    const feed = await owner.client.rpc('get_notifications', { p_limit: 20 });
    const items = feed.data as Array<{ type: string; link: string | null; meta: { nickname?: string }; id: string }>;
    const sub = items.find((n) => n.type === 'record_submitted')!;
    expect(sub.link).toBe(`/records/${rec}`);
    expect(sub.meta.nickname).toBe('m1');
    expect(items.filter((n) => n.type === 'join_request')).toHaveLength(2);
    expect((await owner.client.rpc('get_unread_count')).data).toBe(3);
    await owner.client.rpc('mark_notifications_read', { p_ids: [sub.id] });
    expect((await owner.client.rpc('get_unread_count')).data).toBe(2);
    // m1 cannot mark owner's notifications
    await m1.client.rpc('mark_notifications_read', { p_ids: items.map((n) => n.id) });
    expect((await owner.client.rpc('get_unread_count')).data).toBe(2);
    // review → m1 notified with status meta
    await owner.client.rpc('review_record', { p_record_id: rec, p_action: 'reject', p_reason: '흐림', p_expected_version: 1 });
    const m1feed = (await m1.client.rpc('get_notifications', { p_limit: 20 })).data as Array<{ type: string; meta: { status: string; reason: string } }>;
    expect(m1feed.find((n) => n.type === 'record_review')!.meta).toMatchObject({ status: 'rejected', reason: '흐림' });
  });

  it('link is null for records no longer visible after leaving', async () => {
    const rec = (await submit(m2, 6000, await uploadEvidence(m2, 1))).data as string;
    await owner.client.rpc('review_record', { p_record_id: rec, p_action: 'approve', p_reason: null, p_expected_version: 1 });
    await m2.client.rpc('leave_group');
    const feed = (await m2.client.rpc('get_notifications', { p_limit: 20 })).data as Array<{ type: string; link: string | null }>;
    expect(feed.find((n) => n.type === 'record_review')!.link).toBeNull();
  });

  it('summary auto-show claims exactly once per user/week, only for week participants', async () => {
    // move to next week; previous week (09-07) had m1 (eligible), owner, m2 (left during week)
    await setFakeNow('2026-09-14T04:00:00Z');
    const first = await m1.client.rpc('claim_summary_auto_show');
    expect(first.error).toBeNull();
    const s = first.data as { week: { weekStart: string; state: string }; successCount: number; evaluatedCount: number; members: Array<{ userId: string; leftDuringWeek: boolean }>; myUserId: string };
    expect(s.week.weekStart).toBe('2026-09-07');
    expect(s.week.state).toBe('finalized');
    expect(s.evaluatedCount).toBe(3);
    expect(s.successCount).toBe(1); // m2's 6km approved before leaving
    expect(s.members.find((m) => m.userId === m2.id)!.leftDuringWeek).toBe(true);
    expect(s.myUserId).toBe(m1.id);
    expect((await m1.client.rpc('claim_summary_auto_show')).data).toBeNull();
    // concurrent claims from two devices → exactly one payload
    const [x, y] = await Promise.all([owner.client.rpc('claim_summary_auto_show'), owner.client.rpc('claim_summary_auto_show')]);
    expect([x.data, y.data].filter((v) => v !== null)).toHaveLength(1);
    // m2 left → null; newcomer this week → null
    expect((await m2.client.rpc('claim_summary_auto_show')).data).toBeNull();
    const newbie = await member('newbie');
    const r = (await newbie.client.rpc('request_join', { p_code: code })).data as string;
    await owner.client.rpc('review_join_request', { p_request_id: r, p_approve: true });
    expect((await newbie.client.rpc('claim_summary_auto_show')).data).toBeNull();
    // manual summary stays available
    expect((await m1.client.rpc('get_week_summary', { p_group_id: groupId, p_week_start: '2026-09-07' })).error).toBeNull();
    // several weeks later only the immediately previous week is claimed
    await setFakeNow('2026-10-05T04:00:00Z');
    const later = (await m1.client.rpc('claim_summary_auto_show')).data as { week: { weekStart: string } };
    expect(later.week.weekStart).toBe('2026-09-28');
  });
});
