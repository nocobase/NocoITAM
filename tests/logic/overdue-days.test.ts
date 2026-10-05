import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { daysOverdue } from '../../client/lib/itam/format.js';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 5, 9, 0));
});
afterEach(() => {
  vi.useRealTimers();
});

it('counts whole days past a date, and nothing on or before it', () => {
  // The day the goods are due is not late; the day after is one day.
  expect(daysOverdue('2026-10-05')).toBe(0);
  expect(daysOverdue('2026-10-04')).toBe(1);
  expect(daysOverdue('2026-09-20')).toBe(15);
  expect(daysOverdue('2026-10-08')).toBe(-3);
  // A datetime reads by its date; anything else is not late.
  expect(daysOverdue('2026-10-01T23:00:00.000')).toBe(4);
  expect(daysOverdue(null)).toBe(0);
  expect(daysOverdue('soon')).toBe(0);
});
