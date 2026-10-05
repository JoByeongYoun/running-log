import { describe, it, expect } from 'vitest';
import { evaluate, goalFor, formatWon } from '@/lib/domain/penalty';
import { RUNNER_TYPE_LABEL, RUNNER_TYPES } from '@/lib/domain/runner-type';

const S = { targetMeters: 15000, freeMinMeters: 5000, penaltyPerKmWon: 10000, zeroKmPenaltyWon: 100000 };

describe('evaluate', () => {
  it('passion: success at or above target, no penalty, ranked', () => {
    expect(evaluate('passion', 15000, S)).toEqual({ outcome: 'success', penaltyWon: 0, ranked: true, goalMeters: 15000 });
    expect(evaluate('passion', 20000, S)).toMatchObject({ outcome: 'success', penaltyWon: 0 });
  });
  it('passion: shortfall rounds up per started km', () => {
    expect(evaluate('passion', 12300, S)).toMatchObject({ outcome: 'fail', penaltyWon: 30000 });
    expect(evaluate('passion', 14900, S)).toMatchObject({ outcome: 'fail', penaltyWon: 10000 });
    expect(evaluate('passion', 14000, S)).toMatchObject({ outcome: 'fail', penaltyWon: 10000 });
    expect(evaluate('passion', 13999, S)).toMatchObject({ outcome: 'fail', penaltyWon: 20000 });
  });
  it('0m replaces per-km with the flat zero-km penalty for passion and free', () => {
    expect(evaluate('passion', 0, S)).toMatchObject({ outcome: 'fail', penaltyWon: 100000 });
    expect(evaluate('free', 0, S)).toMatchObject({ outcome: 'fail', penaltyWon: 100000 });
  });
  it('free: weekly total vs free minimum, never ranked', () => {
    expect(evaluate('free', 5000, S)).toEqual({ outcome: 'success', penaltyWon: 0, ranked: false, goalMeters: 5000 });
    expect(evaluate('free', 2500, S)).toMatchObject({ outcome: 'fail', penaltyWon: 30000, ranked: false });
  });
  it('injured: not evaluated, zero penalty, no goal', () => {
    expect(evaluate('injured', 0, S)).toEqual({ outcome: 'not_evaluated', penaltyWon: 0, ranked: false, goalMeters: null });
    expect(evaluate('injured', 99000, S)).toMatchObject({ outcome: 'not_evaluated', penaltyWon: 0 });
  });
  it('zero per-km rate yields zero penalty but still fails', () => {
    expect(evaluate('passion', 1000, { ...S, penaltyPerKmWon: 0 })).toMatchObject({ outcome: 'fail', penaltyWon: 0 });
  });
});

describe('goalFor / formatWon / labels', () => {
  it('goalFor', () => {
    expect(goalFor('passion', S)).toBe(15000);
    expect(goalFor('free', S)).toBe(5000);
    expect(goalFor('injured', S)).toBeNull();
  });
  it('formatWon', () => {
    expect(formatWon(0)).toBe('0원');
    expect(formatWon(30000)).toBe('30,000원');
    expect(formatWon(1234567)).toBe('1,234,567원');
  });
  it('labels cover every type', () => {
    expect(RUNNER_TYPES).toEqual(['passion', 'free', 'injured']);
    expect(RUNNER_TYPE_LABEL).toEqual({ passion: '열정러너', free: '자유러너', injured: '부상러너' });
  });
});
