/** DB 함수가 raise하는 코드 → 사용자 메시지 */
const MESSAGES: Record<string, string> = {
  forbidden: '권한이 없습니다.',
  not_found: '대상을 찾을 수 없습니다.',
  profile_incomplete: '프로필을 먼저 완성하세요.',
  already_in_group: '이미 참여 중인 그룹이 있습니다.',
  pending_request_exists: '이미 승인 대기 중인 참여 요청이 있습니다.',
  group_archived: '보관된 그룹에는 참여할 수 없습니다.',
  invalid_invite: '초대 코드가 올바르지 않습니다.',
  transfer_required: '다른 멤버에게 관리자 권한을 위임한 뒤 탈퇴할 수 있습니다.',
  not_member: '그룹 멤버가 아닙니다.',
  week_not_open: '이번 주 기록을 등록할 수 없는 상태입니다.',
  week_finalized: '이미 확정된 주차입니다.',
  review_closed: '검토 기한이 지났습니다.',
  stale_version: '기록이 수정되었습니다. 내용을 다시 확인한 뒤 처리하세요.',
  edit_window_closed: '오늘 등록한 기록만 수정·삭제할 수 있습니다.',
  photos_required: '사진을 1장 이상 첨부하세요.',
  too_many_photos: '사진은 최대 5장입니다.',
  upload_not_owned: '사진 업로드 정보가 올바르지 않습니다.',
  upload_not_ready: '업로드가 끝나지 않은 사진이 있습니다.',
  upload_expired: '업로드 유효 시간이 지났습니다. 사진을 다시 올려주세요.',
  upload_missing: '업로드된 파일을 찾을 수 없습니다.',
  invalid_content_type: 'JPEG, PNG, WebP 이미지만 올릴 수 있습니다.',
  file_too_large: '파일은 10MB 이하여야 합니다.',
  reason_required: '사유를 입력하세요.',
  invalid_status: '현재 상태에서는 처리할 수 없습니다.',
  rate_limited: '요청이 너무 많습니다. 잠시 후 다시 시도하세요.',
  date_changed: '날짜가 바뀌었습니다. 오늘 날짜로 다시 확인한 뒤 제출하세요.',
  invalid_input: '입력값을 확인하세요.',
  before_group_created: '그룹 생성 전 주차는 조회할 수 없습니다.',
};

export function messageForError(err: { message?: string } | string | null | undefined): string {
  const raw = typeof err === 'string' ? err : err?.message ?? '';
  for (const code of Object.keys(MESSAGES)) {
    if (raw === code || raw.startsWith(code + ':') || raw.includes(`"${code}"`) || raw.endsWith(' ' + code)) return MESSAGES[code];
  }
  if (MESSAGES[raw]) return MESSAGES[raw];
  return '처리 중 오류가 발생했습니다. 잠시 후 다시 시도하세요.';
}

export function errorCode(err: { message?: string } | null | undefined): string | null {
  const raw = err?.message ?? '';
  const code = raw.split(':')[0].trim();
  return code in MESSAGES ? code : null;
}
