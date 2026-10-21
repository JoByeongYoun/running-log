import { describe, it, expect } from 'vitest';
import { pickSummaryPhotos } from '@/lib/dashboard/summary-photos';

const rec = (id: string, userId: string, paths: string[]) => ({ recordId: id, userId, nickname: userId, paths });

describe('pickSummaryPhotos', () => {
  it('기록당 첫 사진만 쓰고 사진 없는 기록은 건너뛴다', () => {
    const out = pickSummaryPhotos([rec('a', 'u1', ['p1', 'p2']), rec('b', 'u2', [])]);
    expect(out).toEqual([{ recordId: 'a', userId: 'u1', nickname: 'u1', path: 'p1' }]);
  });
  it('멤버별로 돌아가며 뽑아 한 사람이 도배하지 않는다', () => {
    const out = pickSummaryPhotos([rec('a1', 'u1', ['x']), rec('a2', 'u1', ['x']), rec('a3', 'u1', ['x']), rec('b1', 'u2', ['x']), rec('c1', 'u3', ['x'])], 4);
    expect(out.map((p) => p.recordId)).toEqual(['a1', 'b1', 'c1', 'a2']);
  });
  it('상한을 넘지 않는다', () => {
    const many = Array.from({ length: 20 }, (_, i) => rec(`r${i}`, `u${i % 5}`, ['x']));
    expect(pickSummaryPhotos(many)).toHaveLength(9);
  });
});
