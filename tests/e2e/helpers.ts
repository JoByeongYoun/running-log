import { createClient } from '@supabase/supabase-js';
import type { Page } from '@playwright/test';
import path from 'node:path';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const secret = process.env.SUPABASE_SECRET_KEY!;
export const PASSWORD = 'password-1234';
export const PHOTO = path.join(__dirname, 'fixtures', 'photo.jpg');

export function admin() {
  return createClient(url, secret, { auth: { persistSession: false } });
}

export async function createConfirmedUser(label: string) {
  const email = `${label}-${Date.now()}@e2e.local`;
  const { data, error } = await admin().auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  return { id: data.user.id, email };
}

export async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('이메일').fill(email);
  await page.getByLabel('비밀번호').fill(PASSWORD);
  await page.getByRole('button', { name: '로그인' }).click();
}

export async function onboard(page: Page, nickname: string) {
  await page.waitForURL(/\/onboarding/);
  await page.getByLabel('프로필 사진 선택').setInputFiles(PHOTO);
  await page.getByRole('button', { name: '사진 변경' }).waitFor();
  await page.getByLabel('닉네임').fill(nickname);
  await page.getByRole('button', { name: '시작하기' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/onboarding'));
}
