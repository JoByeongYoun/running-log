import { describe, it, expect } from 'vitest';
import { assignRanks } from '@/lib/domain/rank';

describe('assignRanks', () => {
  it('uses 1,2,2,4 competition ranking on totalMeters desc', () => {
    const rows = [
      { id: 'a', totalMeters: 10000 },
      { id: 'b', totalMeters: 20000 },
      { id: 'c', totalMeters: 10000 },
      { id: 'd', totalMeters: 0 },
    ];
    expect(assignRanks(rows).map((r) => [r.id, r.rank])).toEqual([['b', 1], ['a', 2], ['c', 2], ['d', 4]]);
  });
  it('returns empty for empty input', () => {
    expect(assignRanks([])).toEqual([]);
  });
});
