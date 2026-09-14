'use server';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase/server';
import { messageForError } from '@/lib/errors';

function revalidate() { revalidatePath('/'); revalidatePath('/group'); revalidatePath('/profile'); revalidatePath('/admin'); }

/** 멤버: 휴식(평가 일시 제외) 신청 */
export async function requestRest(reason: string): Promise<{ error?: string }> {
  const supabase = await createServerSupabase();
  const trimmed = reason.trim();
  const { error } = await supabase.rpc('request_rest', trimmed ? { p_reason: trimmed } : {});
  if (error) return { error: messageForError(error) };
  revalidate();
  return {};
}

export async function cancelRestRequest(requestId: string): Promise<{ error?: string }> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc('cancel_rest_request', { p_request_id: requestId });
  if (error) return { error: messageForError(error) };
  revalidate();
  return {};
}

/** 멤버: 휴식 종료(복귀). 승인 없이 바로 평가 대상으로 돌아간다. */
export async function endMyRest(): Promise<{ error?: string }> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc('end_my_rest');
  if (error) return { error: messageForError(error) };
  revalidate();
  return {};
}

/** 관리자: 휴식 신청 승인/거절 */
export async function reviewRestRequest(requestId: string, approve: boolean): Promise<{ error?: string }> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc('review_rest_request', { p_request_id: requestId, p_approve: approve });
  if (error) return { error: messageForError(error) };
  revalidate();
  return {};
}

/** 관리자: 신청 없이 멤버를 휴식 상태로 만들거나 해제 */
export async function setMemberRest(groupId: string, userId: string, resting: boolean): Promise<{ error?: string }> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc('set_member_rest', { p_group_id: groupId, p_user_id: userId, p_resting: resting });
  if (error) return { error: messageForError(error) };
  revalidate();
  return {};
}
