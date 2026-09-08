import { describe, it, expect } from 'vitest';
import { nicknameSchema, penaltySchema, distanceInputSchema } from '@/lib/domain/validation';
import { MAX_TARGET_METERS } from '@/lib/domain/constants';

describe('validation schemas', () => {
  it('trims and bounds nickname', () => {
    expect(nicknameSchema.parse(' ab ')).toBe('ab');
    expect(nicknameSchema.safeParse('a').success).toBe(false);
    expect(nicknameSchema.safeParse('가'.repeat(21)).success).toBe(false);
  });
  it('bounds penalty', () => {
    expect(penaltySchema.safeParse('x'.repeat(501)).success).toBe(false);
    expect(penaltySchema.parse('없음')).toBe('없음');
  });
  it('distance schema converts to meters with custom max', () => {
    expect(distanceInputSchema().parse('5.25')).toBe(5250);
    expect(distanceInputSchema(MAX_TARGET_METERS).parse('1000')).toBe(1_000_000);
    expect(distanceInputSchema().safeParse('1000').success).toBe(false);
  });
});
