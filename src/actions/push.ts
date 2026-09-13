'use server';
import { z } from 'zod';
import { createServerSupabase } from '@/lib/supabase/server';
import { messageForError } from '@/lib/errors';

const inputSchema = z.object({
  endpoint: z.url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
  userAgent: z.string().max(300).optional(),
});
export type PushSubscriptionInput = z.infer<typeof inputSchema>;

export async function savePushSubscription(input: PushSubscriptionInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: '구독 정보가 올바르지 않습니다.' };
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: parsed.data.endpoint, p_p256dh: parsed.data.keys.p256dh, p_auth: parsed.data.keys.auth, p_user_agent: parsed.data.userAgent ?? '',
  });
  if (error) return { ok: false, error: messageForError(error) };
  return { ok: true };
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  const supabase = await createServerSupabase();
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
}

export async function hasPushSubscription(endpoint: string): Promise<boolean> {
  const supabase = await createServerSupabase();
  const { count } = await supabase.from('push_subscriptions').select('id', { count: 'exact', head: true }).eq('endpoint', endpoint);
  return (count ?? 0) > 0;
}
