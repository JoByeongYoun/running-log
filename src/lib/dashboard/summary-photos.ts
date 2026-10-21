/** 콜라주에 넣을 최대 사진 수. 카드 한 장에 들어갈 만큼만. */
export const SUMMARY_PHOTO_LIMIT = 9;

export type PhotoSource = { recordId: string; userId: string; nickname: string; paths: string[] };
export type PickedPhoto = { recordId: string; userId: string; nickname: string; path: string };

/**
 * 기록마다 대표 사진 1장(첫 번째)만 쓰고, 한 사람이 도배하지 않도록
 * 멤버별로 돌아가며 한 장씩 뽑는다. 입력 순서(활동일 순)를 유지한다.
 */
export function pickSummaryPhotos(records: PhotoSource[], limit = SUMMARY_PHOTO_LIMIT): PickedPhoto[] {
  const queues = new Map<string, PickedPhoto[]>();
  for (const r of records) {
    const path = r.paths[0];
    if (!path) continue;
    const q = queues.get(r.userId) ?? [];
    q.push({ recordId: r.recordId, userId: r.userId, nickname: r.nickname, path });
    queues.set(r.userId, q);
  }
  const picked: PickedPhoto[] = [];
  while (picked.length < limit && queues.size > 0) {
    for (const [uid, q] of [...queues]) {
      const p = q.shift();
      if (p) picked.push(p);
      if (q.length === 0) queues.delete(uid);
      if (picked.length >= limit) break;
    }
  }
  return picked;
}
