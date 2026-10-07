'use server';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase/server';
import { messageForError } from '@/lib/errors';
import { isRunnerType, type RunnerType } from '@/lib/domain/runner-type';
import { uuidSchema } from '@/lib/domain/validation';

/** 관리자: 멤버 러너 유형(뱃지) 변경. 진행 중인 주부터 적용. */
export async function setMemberRunnerType(groupId: string, userId: string, type: RunnerType): Promise<{ error?: string }> {
  if (!uuidSchema.safeParse(groupId).success || !uuidSchema.safeParse(userId).success || !isRunnerType(type)) return { error: '입력값을 확인하세요.' };
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc('set_member_runner_type', { p_group_id: groupId, p_user_id: userId, p_type: type });
  if (error) return { error: messageForError(error) };
  revalidatePath('/'); revalidatePath('/group'); revalidatePath('/profile'); revalidatePath('/admin');
  return {};
}
