import { describe, it, expect } from 'vitest';
import { safeReturnTo } from '@/lib/auth/return-to';

describe('safeReturnTo', () => {
  it('allows internal paths only', () => {
    expect(safeReturnTo('/join/abc')).toBe('/join/abc');
    expect(safeReturnTo('/?week=2026-09-07')).toBe('/?week=2026-09-07');
    expect(safeReturnTo('//evil.com')).toBe('/');
    expect(safeReturnTo('https://evil.com')).toBe('/');
    expect(safeReturnTo(null)).toBe('/');
    expect(safeReturnTo('/a\\b')).toBe('/');
    expect(safeReturnTo('/javascript:alert(1)')).toBe('/');
  });
});
