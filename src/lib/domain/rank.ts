/** 승인 거리 내림차순, 공동 순위 1,2,2,4 */
export function assignRanks<T extends { totalMeters: number }>(rows: T[]): (T & { rank: number })[] {
  const sorted = [...rows].sort((a, b) => b.totalMeters - a.totalMeters);
  let rank = 0;
  let prev: number | null = null;
  return sorted.map((row, i) => {
    if (prev === null || row.totalMeters !== prev) rank = i + 1;
    prev = row.totalMeters;
    return { ...row, rank };
  });
}
