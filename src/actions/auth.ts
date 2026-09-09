'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createServerSupabase } from '@/lib/supabase/server';
import { emailSchema, passwordSchema, firstIssue } from '@/lib/domain/validation';
import { safeReturnTo } from '@/lib/auth/return-to';

export type ActionState = { error?: string; success?: string };

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
}

export async function signUp(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ email: emailSchema, password: passwordSchema, returnTo: z.string().optional() })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const returnTo = safeReturnTo(parsed.data.returnTo);
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: `${siteUrl()}/auth/callback?returnTo=${encodeURIComponent(returnTo)}` },
  });
  if (!error && data.session) {
    // 이메일 확인이 꺼진 프로젝트: 가입 즉시 로그인되므로 바로 온보딩으로
    redirect(returnTo === '/' ? '/onboarding' : `/onboarding?returnTo=${encodeURIComponent(returnTo)}`);
  }
  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes('already') || m.includes('exists')) return { error: '이미 가입된 이메일입니다.' };
    if (m.includes('rate limit')) return { error: '인증 메일 발송 한도를 초과했습니다. 약 1시간 뒤에 다시 시도하세요.' };
    return { error: '가입에 실패했습니다. 잠시 후 다시 시도하세요.' };
  }
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
  const returnTo = safeReturnTo(parsed.data.returnTo);
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase.from('profiles').select('onboarding_completed_at').eq('id', user.id).maybeSingle();
    if (!profile?.onboarding_completed_at) {
      redirect(returnTo === '/' ? '/onboarding' : `/onboarding?returnTo=${encodeURIComponent(returnTo)}`);
    }
  }
  redirect(returnTo);
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
