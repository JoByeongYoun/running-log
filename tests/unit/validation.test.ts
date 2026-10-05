import { describe, it, expect } from 'vitest';
import { nicknameSchema, penaltyNoteSchema, wonSchema, wonInputSchema, distanceInputSchema } from '@/lib/domain/validation';
import { MAX_TARGET_METERS } from '@/lib/domain/constants';

describe('validation schemas', () => {
  it('trims and bounds nickname', () => {
    expect(nicknameSchema.parse(' ab ')).toBe('ab');
    expect(nicknameSchema.safeParse('a').success).toBe(false);
    expect(nicknameSchema.safeParse('가'.repeat(21)).success).toBe(false);
  });
  it('penalty note: blank → null, trims, max 500', () => {
    expect(penaltyNoteSchema.parse('')).toBeNull();
    expect(penaltyNoteSchema.parse('  ')).toBeNull();
    expect(penaltyNoteSchema.parse(' 커피 ')).toBe('커피');
    expect(penaltyNoteSchema.safeParse('x'.repeat(501)).success).toBe(false);
  });
  it('parses won with thousands separators and rejects out of range', () => {
    expect(wonSchema.parse('10,000')).toBe(10000);
    expect(wonSchema.parse('0')).toBe(0);
    expect(wonSchema.safeParse('-1').success).toBe(false);
    expect(wonSchema.safeParse('10000001').success).toBe(false);
    expect(wonSchema.safeParse('abc').success).toBe(false);
    expect(wonSchema.safeParse('1.5').success).toBe(false);
    expect(wonInputSchema(1_000_000).safeParse('1,000,001').success).toBe(false);
    expect(wonInputSchema(1_000_000).parse('1,000,000')).toBe(1_000_000);
  });
  it('distance schema converts to meters with custom max', () => {
    expect(distanceInputSchema().parse('5.25')).toBe(5250);
    expect(distanceInputSchema(MAX_TARGET_METERS).parse('1000')).toBe(1_000_000);
    expect(distanceInputSchema().safeParse('1000').success).toBe(false);
  });
});
