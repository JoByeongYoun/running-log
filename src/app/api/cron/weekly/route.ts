import { NextResponse, type NextRequest } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/admin';

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
  const finishedAt = new Date().toISOString();
  if (error) {
    console.error(JSON.stringify({ job: 'weekly', startedAt, finishedAt, error: error.message }));
    return NextResponse.json({ error: 'maintenance_failed' }, { status: 500 });
  }
  console.log(JSON.stringify({ job: 'weekly', startedAt, finishedAt, result: data }));
  return NextResponse.json({ ok: true, startedAt, finishedAt, result: data });
}
