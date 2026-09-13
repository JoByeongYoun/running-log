import { describe, it, expect } from 'vitest';
import { isEditWindowOpen, weekCloseDeadline } from '@/lib/domain/week';

describe('edit window', () => {
  it('deadline is next Monday 12:00 KST', () => {
    expect(weekCloseDeadline('2026-09-07').toISOString()).toBe('2026-09-14T03:00:00.000Z');
  });
  it('open week is always editable, closing week until the deadline, finalized never', () => {
    expect(isEditWindowOpen('2026-09-07', 'open', new Date('2026-09-20T00:00:00Z'))).toBe(true);
    expect(isEditWindowOpen('2026-09-07', 'closing', new Date('2026-09-14T02:59:00Z'))).toBe(true);
    expect(isEditWindowOpen('2026-09-07', 'closing', new Date('2026-09-14T03:00:00Z'))).toBe(false);
    expect(isEditWindowOpen('2026-09-07', 'finalized', new Date('2026-09-10T00:00:00Z'))).toBe(false);
  });
});
