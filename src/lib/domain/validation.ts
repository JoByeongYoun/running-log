import { z } from 'zod';
import {
  COMMENT_MAX, GROUP_NAME_MAX, GROUP_NAME_MIN, MAX_PHOTOS, MAX_TARGET_METERS, MEMO_MAX,
  NICKNAME_MAX, NICKNAME_MIN, PENALTY_MAX, PENALTY_MIN,
} from './constants';
import { parseDistanceToMeters } from './distance';

export const emailSchema = z.string().trim().email('올바른 이메일을 입력하세요.');
export const passwordSchema = z.string().min(8, '비밀번호는 8자 이상이어야 합니다.').max(72);
export const nicknameSchema = z.string().trim()
  .min(NICKNAME_MIN, `닉네임은 ${NICKNAME_MIN}~${NICKNAME_MAX}자입니다.`)
  .max(NICKNAME_MAX, `닉네임은 ${NICKNAME_MIN}~${NICKNAME_MAX}자입니다.`);
export const groupNameSchema = z.string().trim()
  .min(GROUP_NAME_MIN, `그룹명은 ${GROUP_NAME_MIN}~${GROUP_NAME_MAX}자입니다.`)
  .max(GROUP_NAME_MAX, `그룹명은 ${GROUP_NAME_MIN}~${GROUP_NAME_MAX}자입니다.`);
export const penaltySchema = z.string().trim()
  .min(PENALTY_MIN, '벌칙을 입력하세요. 없으면 "없음"을 입력합니다.')
  .max(PENALTY_MAX, `벌칙은 ${PENALTY_MAX}자 이하입니다.`);
export const memoSchema = z.string().trim().max(MEMO_MAX, `메모는 ${MEMO_MAX}자 이하입니다.`);
export const commentSchema = z.string().trim().min(1, '댓글을 입력하세요.').max(COMMENT_MAX, `댓글은 ${COMMENT_MAX}자 이하입니다.`);
export const reasonSchema = z.string().trim().min(1, '사유를 입력하세요.').max(500);
export const uuidSchema = z.string().uuid();
export const uploadIdsSchema = z.array(uuidSchema).min(1, '사진을 1장 이상 첨부하세요.').max(MAX_PHOTOS, `사진은 최대 ${MAX_PHOTOS}장입니다.`);

export const DISTANCE_ERROR_MESSAGES = {
  invalid: '거리는 숫자로 입력하세요. 예: 5.25',
  too_many_decimals: '거리는 소수 둘째 자리까지만 입력할 수 있습니다.',
  out_of_range: '거리는 0.01km 이상 500km 이하여야 합니다.',
} as const;

export function distanceInputSchema(max?: number) {
  return z.string().transform((v, ctx) => {
    const parsed = parseDistanceToMeters(v, max);
    if (!parsed.ok) {
      const msg = parsed.error === 'out_of_range' && max === MAX_TARGET_METERS
        ? '목표는 0.01km 이상 1,000km 이하여야 합니다.'
        : DISTANCE_ERROR_MESSAGES[parsed.error];
      ctx.addIssue({ code: 'custom', message: msg });
      return z.NEVER;
    }
    return parsed.meters;
  });
}

export function firstIssue(err: z.ZodError): string {
  return err.issues[0]?.message ?? '입력값을 확인하세요.';
}
