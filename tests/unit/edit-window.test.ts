import { describe, it, expect } from 'vitest';
import { isEditWindowOpen, weekCloseDeadline, weekSubmitDeadline, earliestSelectableDate } from '@/lib/domain/week';

describe('edit window', () => {
  it('review deadline is the following Tuesday 12:00 KST, submit deadline Tuesday 00:00 KST', () => {
    expect(weekCloseDeadline('2026-09-07').toISOString()).toBe('2026-09-15T03:00:00.000Z');
    expect(weekSubmitDeadline('2026-09-07').toISOString()).toBe('2026-09-14T15:00:00.000Z');
  });
  it('last week is selectable on Monday only', () => {
    expect(earliestSelectableDate('2026-09-14', new Date('2026-09-14T10:00:00Z'))).toBe('2026-09-07'); // Mon 19:00 KST
    expect(earliestSelectableDate('2026-09-15', new Date('2026-09-14T15:00:00Z'))).toBe('2026-09-14'); // Tue 00:00 KST
    expect(earliestSelectableDate('2026-09-13', new Date('2026-09-13T10:00:00Z'))).toBe('2026-09-07'); // Sun
  });
  it('open week is always editable, closing week until the deadline, finalized never', () => {
    expect(isEditWindowOpen('2026-09-07', 'open', new Date('2026-09-20T00:00:00Z'))).toBe(true);
    expect(isEditWindowOpen('2026-09-07', 'closing', new Date('2026-09-15T02:59:00Z'))).toBe(true);
    expect(isEditWindowOpen('2026-09-07', 'closing', new Date('2026-09-15T03:00:00Z'))).toBe(false);
    expect(isEditWindowOpen('2026-09-07', 'finalized', new Date('2026-09-10T00:00:00Z'))).toBe(false);
  });
});
