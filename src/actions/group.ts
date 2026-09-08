'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerSupabase } from '@/lib/supabase/server';
import { messageForError } from '@/lib/errors';
import { groupNameSchema, penaltySchema, distanceInputSchema, firstIssue, uuidSchema } from '@/lib/domain/validation';
import { MAX_TARGET_METERS } from '@/lib/domain/constants';
import type { ActionState } from './auth';

export async function leaveGroup(): Promise<{ error?: string }> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc('leave_group');
  if (error) return { error: messageForError(error) };
  revalidatePath('/');
  return {};
}

const createSchema = z.object({ name: groupNameSchema, target: distanceInputSchema(MAX_TARGET_METERS), penalty: penaltySchema });

export async function createGroup(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc('create_group', {
    p_name: parsed.data.name, p_target_meters: parsed.data.target, p_penalty: parsed.data.penalty,
  });
  if (error) return { error: messageForError(error) };
  const code = data?.[0]?.invite_code;
  revalidatePath('/');
  redirect(`/admin?tab=members&invite=${encodeURIComponent(code ?? '')}`);
}

export async function renameGroup(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ groupId: uuidSchema, name: groupNameSchema }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc('rename_group', { p_group_id: parsed.data.groupId, p_name: parsed.data.name });
  if (error) return { error: messageForError(error) };
  revalidatePath('/'); revalidatePath('/admin');
  return { success: '그룹명을 변경했습니다.' };
}

export async function scheduleSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ groupId: uuidSchema, target: distanceInputSchema(MAX_TARGET_METERS), penalty: penaltySchema })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc('schedule_group_settings', {
    p_group_id: parsed.data.groupId, p_target_meters: parsed.data.target, p_penalty: parsed.data.penalty,
  });
  if (error) return { error: messageForError(error) };
  revalidatePath('/admin');
  return { success: `${data}부터 적용됩니다.` };
}

export async function transferAdmin(groupId: string, toUserId: string): Promise<{ error?: string }> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc('transfer_admin', { p_group_id: groupId, p_to_user_id: toUserId });
  if (error) return { error: messageForError(error) };
  revalidatePath('/'); revalidatePath('/admin');
  return {};
}

export async function regenerateInvite(groupId: string): Promise<{ code?: string; error?: string }> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc('regenerate_invite_code', { p_group_id: groupId });
  if (error) return { error: messageForError(error) };
  return { code: data ?? undefined };
}
