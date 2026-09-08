/**
 * 로컬 데모 데이터 생성 (운영 금지). `npm run db:reset` 후 실행.
 *   npx tsx scripts/seed-demo.ts
 * 관리자 demo-admin@local.test / 멤버 demo-1..3@local.test, 비밀번호 password-1234
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import sharp from 'sharp';
config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const PASSWORD = 'password-1234';

async function user(email: string, nickname: string, color: { r: number; g: number; b: number }) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  const client = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  await client.auth.signInWithPassword({ email, password: PASSWORD });
  const avatar = await sharp({ create: { width: 128, height: 128, channels: 3, background: color } }).jpeg().toBuffer();
  const path = `${data.user.id}/avatar.jpg`;
  await client.storage.from('avatars').upload(path, avatar, { contentType: 'image/jpeg' });
  await client.from('profiles').update({ nickname, avatar_path: path, onboarding_completed_at: new Date().toISOString() }).eq('id', data.user.id);
  return { id: data.user.id, client };
}

async function record(u: Awaited<ReturnType<typeof user>>, km: number) {
  const photo = await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 30, g: 41, b: 59 } } }).jpeg().toBuffer();
  const { data: slot } = await u.client.rpc('create_upload_slot', { p_content_type: 'image/jpeg', p_byte_size: photo.length });
  await u.client.storage.from('evidence').upload(slot![0].storage_path, photo, { contentType: 'image/jpeg' });
  await u.client.rpc('mark_upload_ready', { p_upload_id: slot![0].upload_id });
  const { data, error } = await u.client.rpc('submit_record', { p_submission_key: crypto.randomUUID(), p_distance_meters: Math.round(km * 1000), p_memo: '데모 기록', p_upload_ids: [slot![0].upload_id] });
  if (error) throw error;
  return data as string;
}

async function main() {
  const owner = await user('demo-admin@local.test', '러닝반장', { r: 52, g: 211, b: 153 });
  const { data: g } = await owner.client.rpc('create_group', { p_name: '데모 러닝 크루', p_target_meters: 15000, p_penalty: '다음 모임 커피 쏘기' });
  const code = g![0].invite_code;
  const members = [];
  for (const [i, name] of ['새벽러너', '퇴근런', '주말조깅'].entries()) {
    const m = await user(`demo-${i + 1}@local.test`, name, { r: 99 + i * 40, g: 102, b: 241 });
    const { data: req } = await m.client.rpc('request_join', { p_code: code });
    await owner.client.rpc('review_join_request', { p_request_id: req, p_approve: true });
    members.push(m);
  }
  const r1 = await record(members[0], 5.2);
  await owner.client.rpc('review_record', { p_record_id: r1, p_action: 'approve', p_reason: '', p_expected_version: 1 });
  await record(members[1], 3.4);
  const r3 = await record(members[2], 8);
  await owner.client.rpc('review_record', { p_record_id: r3, p_action: 'reject', p_reason: '거리 숫자가 보이지 않습니다', p_expected_version: 1 });
  await record(owner, 6.1);
  console.log(`demo group ready. invite code: ${code}\nlogin: demo-admin@local.test / ${PASSWORD} (members demo-1..3@local.test)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
