export const MAX_RECORD_METERS = 500_000;
export const MAX_TARGET_METERS = 1_000_000;
export const MAX_PHOTOS = 5;
export const MIN_PHOTOS = 1;
export const MAX_FILE_BYTES = 10_485_760;
// 주간 마감 후 증거 사진 보관 기간. 지나면 사진만 삭제되고 기록은 남는다 (Supabase Free 1GB 상한 대응).
export const PHOTO_RETENTION_WEEKS = 8;
export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 20;
export const GROUP_NAME_MIN = 2;
export const GROUP_NAME_MAX = 30;
export const PENALTY_MIN = 1;
export const PENALTY_MAX = 500;
export const MEMO_MAX = 1000;
export const COMMENT_MAX = 1000;
// 아바타 서명 URL 만료. 탭 복귀·라우터 캐시 재사용 시 이미지가 지연 로드되므로 짧으면 일괄 깨진다.
export const SIGNED_URL_TTL_SECONDS = 60 * 60;
export const TZ = 'Asia/Seoul';
