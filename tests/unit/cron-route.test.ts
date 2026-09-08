import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabase: () => ({ rpc: async () => ({ data: { createdWeeks: 0, finalized: 0, closing: 0, weekIds: [] }, error: null }) }),
}));

describe('GET /api/cron/weekly', () => {
  it('rejects a missing or wrong secret and accepts the right one', async () => {
    process.env.CRON_SECRET = 'test-secret';
    const { GET } = await import('@/app/api/cron/weekly/route');
    const bad = await GET(new NextRequest('http://localhost/api/cron/weekly'));
    expect(bad.status).toBe(401);
    const wrong = await GET(new NextRequest('http://localhost/api/cron/weekly', { headers: { authorization: 'Bearer nope' } }));
    expect(wrong.status).toBe(401);
    const ok = await GET(new NextRequest('http://localhost/api/cron/weekly', { headers: { authorization: 'Bearer test-secret' } }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).result.finalized).toBe(0);
  });
});
