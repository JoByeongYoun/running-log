'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createServerSupabase } from '@/lib/supabase/server';
import { emailSchema, passwordSchema, firstIssue } from '@/lib/domain/validation';
import { safeReturnTo } from '@/lib/auth/return-to';

export type ActionState = { error?: string; success?: string };

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
}

export async function signUp(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ email: emailSchema, password: passwordSchema, returnTo: z.string().optional() })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const returnTo = safeReturnTo(parsed.data.returnTo);
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: `${siteUrl()}/auth/callback?returnTo=${encodeURIComponent(returnTo)}` },
  });
  if (error) return { error: error.message.includes('already') ? '이미 가입된 이메일입니다.' : '가입에 실패했습니다. 잠시 후 다시 시도하세요.' };
  return { success: '확인 메일을 보냈습니다. 메일의 링크를 눌러 인증을 완료하세요.' };
}

export async function signIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ email: emailSchema, password: z.string().min(1, '비밀번호를 입력하세요.'), returnTo: z.string().optional() })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  if (error) {
    if (error.message.toLowerCase().includes('not confirmed')) return { error: '이메일 인증이 필요합니다. 메일함을 확인하세요.' };
    return { error: '이메일 또는 비밀번호가 올바르지 않습니다.' };
  }
  redirect(safeReturnTo(parsed.data.returnTo));
}

export async function signOut(): Promise<void> {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function requestPasswordReset(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ email: emailSchema }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const supabase = await createServerSupabase();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, { redirectTo: `${siteUrl()}/auth/callback?returnTo=%2Freset-password` });
  return { success: '가입된 이메일이면 재설정 링크를 보냈습니다.' };
}

export async function updatePassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ password: passwordSchema, confirm: z.string() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  if (parsed.data.password !== parsed.data.confirm) return { error: '비밀번호가 일치하지 않습니다.' };
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: '비밀번호 변경에 실패했습니다. 링크가 만료되었을 수 있습니다.' };
  redirect('/');
}
