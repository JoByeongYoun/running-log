import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
const rpc = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({ createAdminSupabase: () => ({ rpc }) }));
const sendToUser = vi.fn();
const isPushConfigured = vi.fn();
vi.mock('@/lib/push/send', () => ({ sendToUser, isPushConfigured }));

const ID = '11111111-1111-4111-8111-111111111111';
function post(body: unknown, secret?: string) {
  return new NextRequest('http://localhost/api/push/dispatch', {
    method: 'POST', body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...(secret ? { 'x-push-secret': secret } : {}) },
  });
}

describe('POST /api/push/dispatch', () => {
  beforeEach(() => { rpc.mockReset(); sendToUser.mockReset(); isPushConfigured.mockReturnValue(true); process.env.PUSH_WEBHOOK_SECRET = 's3cret'; });

  it('rejects a missing or wrong secret', async () => {
    const { POST } = await import('@/app/api/push/dispatch/route');
    expect((await POST(post({ notificationId: ID }))).status).toBe(401);
    expect((await POST(post({ notificationId: ID }, 'nope'))).status).toBe(401);
  });

  it('rejects a malformed body', async () => {
    const { POST } = await import('@/app/api/push/dispatch/route');
    expect((await POST(post({ notificationId: 'abc' }, 's3cret'))).status).toBe(400);
  });

  it('skips unknown notifications and unconfigured VAPID with 200', async () => {
    const { POST } = await import('@/app/api/push/dispatch/route');
    rpc.mockResolvedValueOnce({ data: null, error: null });
    const nf = await POST(post({ notificationId: ID }, 's3cret'));
    expect(nf.status).toBe(200); expect((await nf.json()).skipped).toBe('not_found');
    isPushConfigured.mockReturnValue(false);
    rpc.mockResolvedValueOnce({ data: { userId: 'u1', view: { id: ID, type: 'join_result', link: '/', meta: {} } }, error: null });
    const uc = await POST(post({ notificationId: ID }, 's3cret'));
    expect(uc.status).toBe(200); expect((await uc.json()).skipped).toBe('unconfigured');
    expect(sendToUser).not.toHaveBeenCalled();
  });

  it('sends the rendered notification to the recipient', async () => {
    const { POST } = await import('@/app/api/push/dispatch/route');
    rpc.mockResolvedValueOnce({ data: { userId: 'u1', view: { id: ID, type: 'record_review', link: null, readAt: null, createdAt: '', meta: { status: 'approved', meters: 5000 } } }, error: null });
    sendToUser.mockResolvedValueOnce({ sent: 2, removed: 0, failed: 0 });
    const res = await POST(post({ notificationId: ID }, 's3cret'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, sent: 2 });
    expect(rpc).toHaveBeenCalledWith('get_push_payload', { p_notification_id: ID });
    expect(sendToUser).toHaveBeenCalledWith(expect.anything(), 'u1', { title: 'Running Log', body: '5.00km 기록이 승인되었습니다.', url: '/notifications', tag: ID });
  });
});
