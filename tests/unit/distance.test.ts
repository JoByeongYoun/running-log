import { describe, it, expect } from 'vitest';
import { parseDistanceToMeters, formatMeters } from '@/lib/domain/distance';

describe('parseDistanceToMeters', () => {
  it('parses two decimals to integer meters', () => {
    expect(parseDistanceToMeters('12.34')).toEqual({ ok: true, meters: 12340 });
    expect(parseDistanceToMeters('5')).toEqual({ ok: true, meters: 5000 });
    expect(parseDistanceToMeters(' 0.1 ')).toEqual({ ok: true, meters: 100 });
  });
  it('rejects three decimals instead of rounding', () => {
    expect(parseDistanceToMeters('12.345')).toEqual({ ok: false, error: 'too_many_decimals' });
  });
  it('rejects zero, negative, non-numeric, and over 500km', () => {
    expect(parseDistanceToMeters('0')).toEqual({ ok: false, error: 'out_of_range' });
    expect(parseDistanceToMeters('-1')).toEqual({ ok: false, error: 'invalid' });
    expect(parseDistanceToMeters('abc')).toEqual({ ok: false, error: 'invalid' });
    expect(parseDistanceToMeters('500.01')).toEqual({ ok: false, error: 'out_of_range' });
    expect(parseDistanceToMeters('500')).toEqual({ ok: true, meters: 500000 });
  });
  it('formats meters as km with two decimals', () => {
    expect(formatMeters(12340)).toBe('12.34');
    expect(formatMeters(5000)).toBe('5.00');
    expect(formatMeters(0)).toBe('0.00');
  });
});
