import { describe, it, expect } from 'vitest';
import { weekStartOf, kstDateOf, weekRange, addWeeks, mondayOf, isValidYmd } from '@/lib/domain/week';

describe('weekStartOf', () => {
  it('Sunday 23:59 KST belongs to the previous week', () => {
    expect(weekStartOf(new Date('2026-09-13T14:59:00Z'))).toBe('2026-09-07');
  });
  it('Monday 00:00 KST starts a new week', () => {
    expect(weekStartOf(new Date('2026-09-13T15:00:00Z'))).toBe('2026-09-14');
  });
  it('kstDateOf uses Seoul date', () => {
    expect(kstDateOf(new Date('2026-09-13T15:00:00Z'))).toBe('2026-09-14');
    expect(kstDateOf(new Date('2026-09-13T14:59:59Z'))).toBe('2026-09-13');
  });
  it('weekRange returns Monday..Sunday', () => {
    expect(weekRange('2026-09-07')).toEqual({ start: '2026-09-07', end: '2026-09-13' });
  });
  it('addWeeks moves by 7 days', () => {
    expect(addWeeks('2026-09-07', 1)).toBe('2026-09-14');
    expect(addWeeks('2026-09-07', -1)).toBe('2026-08-31');
  });
  it('mondayOf normalizes any date', () => {
    expect(mondayOf('2026-09-10')).toBe('2026-09-07');
    expect(mondayOf('2026-09-07')).toBe('2026-09-07');
  });
  it('isValidYmd rejects malformed dates', () => {
    expect(isValidYmd('2026-02-30')).toBe(false);
    expect(isValidYmd('2026-09-07')).toBe(true);
    expect(isValidYmd('abc')).toBe(false);
  });
});
