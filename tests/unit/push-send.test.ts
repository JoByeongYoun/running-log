import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
const sendNotification = vi.fn();
vi.mock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification } }));

type Row = { id: string; endpoint: string; p256dh: string; auth: string };
function fakeAdmin(rows: Row[]) {
  const deleted: string[] = []; const touched: string[] = [];
  const admin = {
    from: () => ({
      select: () => ({ eq: async () => ({ data: rows, error: null }) }),
      delete: () => ({ eq: async (_c: string, id: string) => { deleted.push(id); return { error: null }; } }),
      update: () => ({ eq: async (_c: string, id: string) => { touched.push(id); return { error: null }; } }),
    }),
  };
  return { admin: admin as never, deleted, touched };
}

describe('sendToUser', () => {
  beforeEach(() => {
    sendNotification.mockReset();
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'pub';
    process.env.VAPID_PRIVATE_KEY = 'priv';
    process.env.VAPID_SUBJECT = 'mailto:test@example.com';
  });

  it('removes gone subscriptions, touches successful ones, counts other failures', async () => {
    const { sendToUser } = await import('@/lib/push/send');
    sendNotification
      .mockResolvedValueOnce({ statusCode: 201 })
      .mockRejectedValueOnce({ statusCode: 410 })
      .mockRejectedValueOnce({ statusCode: 500 });
    const rows = [
      { id: 'a', endpoint: 'https://p/a', p256dh: 'k', auth: 'x' },
      { id: 'b', endpoint: 'https://p/b', p256dh: 'k', auth: 'x' },
      { id: 'c', endpoint: 'https://p/c', p256dh: 'k', auth: 'x' },
    ];
    const { admin, deleted, touched } = fakeAdmin(rows);
    const result = await sendToUser(admin, 'u1', { title: 't', body: 'b', url: '/', tag: 'n1' });
    expect(result).toEqual({ sent: 1, removed: 1, failed: 1 });
    expect(deleted).toEqual(['b']);
    expect(touched).toEqual(['a']);
    expect(sendNotification).toHaveBeenCalledTimes(3);
    expect(sendNotification.mock.calls[0][0]).toEqual({ endpoint: 'https://p/a', keys: { p256dh: 'k', auth: 'x' } });
  });

  it('reports unconfigured when a VAPID variable is missing', async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    vi.resetModules();
    const { isPushConfigured, sendToUser } = await import('@/lib/push/send');
    expect(isPushConfigured()).toBe(false);

    const mockFrom = vi.fn();
    const admin = {
      from: mockFrom,
    } as never;
    const result = await sendToUser(admin, 'u1', { title: 't', body: 'b', url: '/', tag: 'n1' });
    expect(result).toEqual({ sent: 0, removed: 0, failed: 0 });
    expect(sendNotification).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
