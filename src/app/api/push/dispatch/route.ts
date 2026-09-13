import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { isPushConfigured, sendToUser } from '@/lib/push/send';
import { notificationText, notificationTitle, type NotificationView } from '@/lib/notification-text';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({ notificationId: z.string().uuid() });

export async function POST(request: NextRequest) {
  const secret = process.env.PUSH_WEBHOOK_SECRET;
  if (!secret || request.headers.get('x-push-secret') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  const { notificationId } = parsed.data;

  const admin = createAdminSupabase();
  const { data, error } = await admin.rpc('get_push_payload', { p_notification_id: notificationId });
  if (error) {
    console.error(JSON.stringify({ job: 'push', notificationId, error: error.message }));
    return NextResponse.json({ error: 'payload_failed' }, { status: 500 });
  }
  const payload = data as { userId: string; view: NotificationView } | null;
  if (!payload) return NextResponse.json({ ok: true, skipped: 'not_found' });
  if (!isPushConfigured()) {
    console.log(JSON.stringify({ job: 'push', notificationId, skipped: 'unconfigured' }));
    return NextResponse.json({ ok: true, skipped: 'unconfigured' });
  }

  const result = await sendToUser(admin, payload.userId, {
    title: notificationTitle(payload.view),
    body: notificationText(payload.view),
    url: payload.view.link ?? '/notifications',
    tag: notificationId,
  });
  console.log(JSON.stringify({ job: 'push', notificationId, type: payload.view.type, ...result }));
  return NextResponse.json({ ok: true, ...result });
}
