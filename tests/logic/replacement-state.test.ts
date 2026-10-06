// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  REPLACEMENT_LEAD_DAYS,
  replacementState,
} from '../../client/lib/itam/devices.js';

describe('replacement state', () => {
  const today = new Date('2026-10-06T09:00:00');

  it('says how long past, how soon within a quarter, and how far otherwise', () => {
    expect(replacementState('2026-09-30', today)).toEqual({
      state: 'overdue',
      days: 6,
    });
    expect(replacementState('2026-10-26', today)).toEqual({
      state: 'soon',
      days: 20,
    });
    expect(REPLACEMENT_LEAD_DAYS).toBe(90);
    expect(replacementState('2027-10-06', today)).toEqual({
      state: 'later',
      days: 365,
    });
  });

  it('says nothing about a device with no planned date', () => {
    expect(replacementState(null, today)).toEqual({ state: 'unknown' });
    expect(replacementState('', today)).toEqual({ state: 'unknown' });
  });
});
