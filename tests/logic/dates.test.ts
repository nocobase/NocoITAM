import { describe, expect, it } from 'vitest';

import {
  addDays,
  addMonths,
  isoDate,
  today,
} from '../../server/providers/itam/dates.js';

/**
 * A calendar date is a local fact. Formatting one through `toISOString()`
 * wrote yesterday for every deployment east of UTC until mid-morning — a
 * receipt signed at 00:30 in Shanghai was recorded on the previous day.
 */
describe('calendar dates', () => {
  it('formats a date in the server time zone, not UTC', () => {
    const justAfterMidnight = new Date(2026, 8, 27, 0, 30);
    expect(isoDate(justAfterMidnight)).toBe('2026-09-27');
    const justBeforeMidnight = new Date(2026, 8, 27, 23, 30);
    expect(isoDate(justBeforeMidnight)).toBe('2026-09-27');
  });

  it('reads today from the local clock', () => {
    const now = new Date();
    const local = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');
    expect(today()).toBe(local);
  });

  it('adds days and months as calendar arithmetic', () => {
    expect(addDays('2026-09-27', 7)).toBe('2026-10-04');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addMonths('2026-09-27', 12)).toBe('2027-09-27');
    expect(addMonths('2026-01-31', 1)).toBe('2026-03-03');
  });
});
