'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerSupabase } from '@/lib/supabase/server';
import { messageForError } from '@/lib/errors';
import { groupNameSchema, penaltyNoteSchema, wonSchema, distanceInputSchema, firstIssue, uuidSchema } from '@/lib/domain/validation';
import { MAX_TARGET_METERS } from '@/lib/domain/constants';
import type { ActionState } from './auth';

const settingsFields = {
  target: distanceInputSchema(MAX_TARGET_METERS),
  freeMin: distanceInputSchema(MAX_TARGET_METERS),
  perKmWon: wonSchema,
  zeroWon: wonSchema,
  penalty: penaltyNoteSchema.optional(),
};
const createSchema = z.object({ name: groupNameSchema, ...settingsFields });
const scheduleSchema = z.object({ groupId: uuidSchema, ...settingsFields });

function rpcSettings(d: z.infer<typeof createSchema> | z.infer<typeof scheduleSchema>) {
  // DB 함수는 빈 문자열을 null 로 정규화한다 (생성된 타입이 null 을 받지 않아 '' 로 보낸다)
  return { p_target_meters: d.target, p_free_min_meters: d.freeMin, p_penalty_per_km_won: d.perKmWon, p_zero_km_penalty_won: d.zeroWon, p_penalty: d.penalty ?? '' };
}

export async function leaveGroup(): Promise<{ error?: string }> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc('leave_group');
  if (error) return { error: messageForError(error) };
  revalidatePath('/'); revalidatePath('/group');
  return {};
}

export async function createGroup(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc('create_group', { p_name: parsed.data.name, ...rpcSettings(parsed.data) });
  if (error) return { error: messageForError(error) };
  const code = data?.[0]?.invite_code;
  revalidatePath('/'); revalidatePath('/group');
  redirect(`/admin?tab=members&invite=${encodeURIComponent(code ?? '')}`);
}

export async function renameGroup(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ groupId: uuidSchema, name: groupNameSchema }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc('rename_group', { p_group_id: parsed.data.groupId, p_name: parsed.data.name });
  if (error) return { error: messageForError(error) };
  revalidatePath('/'); revalidatePath('/group'); revalidatePath('/admin');
  return { success: '그룹명을 변경했습니다.' };
}

export async function scheduleSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = scheduleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc('schedule_group_settings', { p_group_id: parsed.data.groupId, ...rpcSettings(parsed.data) });
  if (error) return { error: messageForError(error) };
  revalidatePath('/admin'); revalidatePath('/group');
  return { success: `${data}부터 적용됩니다.` };
}

export async function setGroupNotice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ groupId: uuidSchema, notice: z.string().trim().max(500, '공지사항은 500자 이하입니다.') }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc('set_group_notice', { p_group_id: parsed.data.groupId, p_notice: parsed.data.notice });
  if (error) return { error: messageForError(error) };
  revalidatePath('/'); revalidatePath('/group'); revalidatePath('/admin');
  return { success: parsed.data.notice ? '공지사항을 저장했습니다.' : '공지사항을 지웠습니다.' };
}

export async function transferAdmin(groupId: string, toUserId: string): Promise<{ error?: string }> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc('transfer_admin', { p_group_id: groupId, p_to_user_id: toUserId });
  if (error) return { error: messageForError(error) };
  revalidatePath('/'); revalidatePath('/group'); revalidatePath('/admin');
  return {};
}

export async function regenerateInvite(groupId: string): Promise<{ code?: string; error?: string }> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc('regenerate_invite_code', { p_group_id: groupId });
  if (error) return { error: messageForError(error) };
  return { code: data ?? undefined };
}
