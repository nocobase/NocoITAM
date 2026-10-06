// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { employmentFor } from '../../server/providers/itam/master-data.js';
import { isJoiner } from '../../server/providers/itam/onboarding.js';

/**
 * 在职状态 is the two dates and nothing else. It used to be a field of its own
 * with three writers — the form's select, 标记离职, and the nightly job — and
 * any two of them could disagree.
 */
describe('在职状态 follows the dates', () => {
  const today = '2026-10-04';

  it('is active with neither date', () => {
    expect(employmentFor(null, null, today)).toBe('active');
    expect(employmentFor('', '', today)).toBe('active');
    expect(employmentFor(undefined, undefined, today)).toBe('active');
  });

  it('is left once the leave date has come', () => {
    expect(employmentFor(null, '2026-10-04', today)).toBe('left');
    expect(employmentFor('2020-01-01', '2020-01-31', today)).toBe('left');
  });

  it('is still active while the leave date is ahead', () => {
    expect(employmentFor(null, '2026-10-05', today)).toBe('active');
    expect(employmentFor('2020-01-01', '2099-01-01', today)).toBe('active');
  });

  it('goes back when a leave date is moved out or cleared', () => {
    // Extending a notice period is not rare, and the person was left until
    // the date changed; nothing else has to be undone for them to be active.
    expect(employmentFor(null, '2020-01-31', today)).toBe('left');
    expect(employmentFor(null, '2027-01-31', today)).toBe('active');
    expect(employmentFor(null, null, today)).toBe('active');
  });

  it('is joining until the first day, and active on it', () => {
    // 待入职 (2026-10-06): the register holds a joiner before they start, so
    // a device is reserved and a kit prepared for them.
    expect(employmentFor('2026-10-05', null, today)).toBe('pending');
    expect(employmentFor('2026-10-04', null, today)).toBe('active');
    expect(employmentFor('2026-09-01', null, today)).toBe('active');
  });

  it('puts leaving before joining', () => {
    // An offer withdrawn before the first day: the leave date has come.
    expect(employmentFor('2026-11-01', '2026-10-01', today)).toBe('left');
  });
});

describe('a joiner', () => {
  it('is somebody entered no more than 30 days before their first day', () => {
    expect(isJoiner('2026-10-11', '2026-10-06T13:18:50.002')).toBe(true);
    // Entered a little after starting: still being equipped.
    expect(isJoiner('2026-09-10', '2026-10-06T09:00:00.000')).toBe(true);
    expect(isJoiner('2026-09-06', '2026-10-06T09:00:00.000')).toBe(true);
  });

  it('is not an employee entered long after they started', () => {
    // The register going live, and two years of staff imported into it.
    expect(isJoiner('2024-03-01', '2026-10-06T09:00:00.000')).toBe(false);
    expect(isJoiner('2026-09-05', '2026-10-06T09:00:00.000')).toBe(false);
    expect(isJoiner(null, '2026-10-06T09:00:00.000')).toBe(false);
  });
});
