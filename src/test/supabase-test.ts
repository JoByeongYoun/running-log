import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const secretKey = process.env.SUPABASE_SECRET_KEY!;

export type TestUser = { id: string; email: string; client: SupabaseClient };

let counter = 0;

export function adminClient(): SupabaseClient {
  return createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function anonClient(): SupabaseClient {
  return createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function createTestUser(label = 'u'): Promise<TestUser> {
  const admin = adminClient();
  counter += 1;
  const email = `${label}-${Date.now()}-${counter}@test.local`;
  const password = 'password-1234';
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = anonClient();
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { id: data.user.id, email, client };
}

/** 프로필 완료 처리(테스트 편의). */
export async function completeProfile(user: TestUser, nickname = '러너'): Promise<void> {
  const { error } = await user.client
    .from('profiles')
    .update({ nickname, avatar_path: `${user.id}/avatar.jpg`, onboarding_completed_at: new Date().toISOString() })
    .eq('id', user.id);
  if (error) throw error;
}

export async function setFakeNow(iso: string | null): Promise<void> {
  const { error } = await adminClient().rpc('set_fake_now', { p: iso });
  if (error) throw error;
}

async function emptyBucket(admin: SupabaseClient, bucket: string): Promise<void> {
  const { data } = await admin.schema('storage').from('objects').select('name').eq('bucket_id', bucket);
  const names = (data ?? []).map((o: { name: string }) => o.name);
  if (names.length) await admin.storage.from(bucket).remove(names);
}

export async function resetAll(): Promise<void> {
  const admin = adminClient();
  await emptyBucket(admin, 'avatars');
  await emptyBucket(admin, 'evidence');
  const { error } = await admin.rpc('test_reset');
  if (error) throw error;
}

export function expectRpcError(res: { error: { message: string } | null }, code: string): void {
  if (!res.error) throw new Error(`expected error ${code} but call succeeded`);
  if (!res.error.message.includes(code)) {
    throw new Error(`expected error ${code} but got: ${res.error.message}`);
  }
}
