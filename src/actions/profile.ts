'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { nicknameSchema, firstIssue } from '@/lib/domain/validation';
import { MAX_FILE_BYTES } from '@/lib/domain/constants';
import { safeReturnTo } from '@/lib/auth/return-to';
import type { ActionState } from './auth';

async function verifyOwnedObject(bucket: 'avatars', path: string, userId: string): Promise<string | null> {
  if (!path.startsWith(`${userId}/`)) return '프로필 사진 경로가 올바르지 않습니다.';
  const admin = createAdminSupabase();
  const folder = path.slice(0, path.lastIndexOf('/'));
  const file = path.slice(path.lastIndexOf('/') + 1);
  const { data } = await admin.storage.from(bucket).list(folder, { search: file, limit: 1 });
  const obj = data?.find((o) => o.name === file);
  if (!obj) return '프로필 사진 업로드를 확인할 수 없습니다.';
  const size = (obj.metadata as { size?: number } | null)?.size ?? 0;
  if (size > MAX_FILE_BYTES) return '프로필 사진은 10MB 이하여야 합니다.';
  return null;
}

const schema = z.object({ nickname: nicknameSchema, avatarPath: z.string().min(1, '프로필 사진을 등록하세요.'), returnTo: z.string().optional() });

export async function completeOnboarding(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const problem = await verifyOwnedObject('avatars', parsed.data.avatarPath, user.id);
  if (problem) return { error: problem };
  const { error } = await supabase.from('profiles').update({
    nickname: parsed.data.nickname,
    avatar_path: parsed.data.avatarPath,
    onboarding_completed_at: new Date().toISOString(),
  }).eq('id', user.id);
  if (error) return { error: '프로필 저장에 실패했습니다.' };
  redirect(safeReturnTo(parsed.data.returnTo));
}

export async function updateProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ nickname: nicknameSchema, avatarPath: z.string().optional() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const patch: { nickname: string; avatar_path?: string } = { nickname: parsed.data.nickname };
  if (parsed.data.avatarPath) {
    const problem = await verifyOwnedObject('avatars', parsed.data.avatarPath, user.id);
    if (problem) return { error: problem };
    patch.avatar_path = parsed.data.avatarPath;
  }
  const { error } = await supabase.from('profiles').update(patch).eq('id', user.id);
  if (error) return { error: '프로필 저장에 실패했습니다.' };
  revalidatePath('/');
  revalidatePath('/profile');
  return { success: '저장했습니다.' };
}
