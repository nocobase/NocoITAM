// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { employmentFor } from '../../server/providers/itam/master-data.js';

/**
 * Whether somebody has left is the leave date and nothing else. It used to be
 * a field of its own with three writers — the form's select, 标记离职, and the
 * nightly job — and any two of them could disagree.
 */
describe('在职状态 follows the leave date', () => {
  const today = '2026-10-04';

  it('is active with no leave date', () => {
    expect(employmentFor(null, today)).toBe('active');
    expect(employmentFor('', today)).toBe('active');
    expect(employmentFor(undefined, today)).toBe('active');
  });

  it('is left once the date has come', () => {
    expect(employmentFor('2026-10-04', today)).toBe('left');
    expect(employmentFor('2020-01-31', today)).toBe('left');
  });

  it('is still active while the date is ahead', () => {
    expect(employmentFor('2026-10-05', today)).toBe('active');
    expect(employmentFor('2099-01-01', today)).toBe('active');
  });

  it('goes back when a date is moved out or cleared', () => {
    // Extending a notice period is not rare, and the person was left until
    // the date changed; nothing else has to be undone for them to be active.
    expect(employmentFor('2020-01-31', today)).toBe('left');
    expect(employmentFor('2027-01-31', today)).toBe('active');
    expect(employmentFor(null, today)).toBe('active');
  });

  it('ignores a hire date entirely', () => {
    // Somebody is active from the moment they exist in the register: a device
    // is reserved and a kit prepared before the first day, and an assignment
    // refuses only a person who has left.
    expect(employmentFor(null, '1999-01-01')).toBe('active');
  });
});
