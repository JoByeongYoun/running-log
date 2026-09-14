import { NextResponse, type NextRequest } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { purgeEvidence } from '@/lib/retention/photos';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const startedAt = new Date().toISOString();
  const admin = createAdminSupabase();
  const { data, error } = await admin.rpc('run_week_maintenance');
  if (error) {
    const finishedAt = new Date().toISOString();
    console.error(JSON.stringify({ job: 'weekly', startedAt, finishedAt, error: error.message }));
    return NextResponse.json({ error: 'maintenance_failed' }, { status: 500 });
  }
  // 스토리지 정리는 주간 집계와 독립적이므로 실패해도 집계 결과는 성공으로 남긴다.
  let purge: Awaited<ReturnType<typeof purgeEvidence>> | { error: string };
  try {
    purge = await purgeEvidence(admin);
  } catch (e) {
    purge = { error: e instanceof Error ? e.message : String(e) };
  }
  const finishedAt = new Date().toISOString();
  console.log(JSON.stringify({ job: 'weekly', startedAt, finishedAt, result: data, purge }));
  return NextResponse.json({ ok: true, startedAt, finishedAt, result: data, purge });
}
