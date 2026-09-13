import { describe, it, expect } from 'vitest';
import { SW_SOURCE } from '@/app/sw.js/source';

describe('SW_SOURCE', () => {
  it('parses as valid JavaScript', () => {
    expect(() => new Function(SW_SOURCE)).not.toThrow();
  });

  it('contains no backslash-backtick sequence', () => {
    expect(SW_SOURCE.includes('\\`')).toBe(false);
  });
});
