import 'server-only';
import webpush from 'web-push';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/types';

export type PushPayload = { title: string; body: string; url: string; tag: string };
export type SendResult = { sent: number; removed: number; failed: number };

let configured: boolean | null = null;

export function isPushConfigured(): boolean {
  if (configured !== null) return configured;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!pub || !priv || !subject) { configured = false; return false; }
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
  return true;
}

export async function sendToUser(admin: SupabaseClient<Database>, userId: string, payload: PushPayload): Promise<SendResult> {
  const result: SendResult = { sent: 0, removed: 0, failed: 0 };
  if (!isPushConfigured()) return result;
  const { data: rows, error } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', userId);
  if (error || !rows) { result.failed = 1; return result; }
  const body = JSON.stringify(payload);
  await Promise.all(rows.map(async (row) => {
    try {
      await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, body, { TTL: 86400 });
      await admin.from('push_subscriptions').update({ last_used_at: new Date().toISOString() }).eq('id', row.id);
      result.sent += 1;
    } catch (err) {
      const status = (err as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 410) {
        await admin.from('push_subscriptions').delete().eq('id', row.id);
        result.removed += 1;
      } else {
        console.error(JSON.stringify({ job: 'push', event: 'send_failed', status: status ?? null }));
        result.failed += 1;
      }
    }
  }));
  return result;
}
