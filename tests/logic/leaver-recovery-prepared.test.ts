// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  deviceHandling,
  recoveryPlan,
  stockHandling,
} from '../../server/providers/itam/maintenance.js';

/**
 * The preparation is a rule, not a model call: which handling applies follows
 * from the record. These are the same judgements `ai/skills/offboarding`
 * states in prose, so the two must not drift — a device at the repair shop is
 * not returned, a consumable already issued is usually used up, and a seat is
 * reclaimed whatever account it carries.
 */
describe('what is to be done with what a leaver holds', () => {
  it('leaves a device at the repair shop alone', () => {
    expect(deviceHandling('inRepair')).toBe('wait');
  });

  it('returns one that is in their hands', () => {
    expect(deviceHandling('inUse')).toBe('return');
    expect(deviceHandling('onLoan')).toBe('return');
  });

  it('asks for nothing back from one already out of use', () => {
    for (const status of ['lost', 'retired', 'pendingDisposal', 'disposed'])
      expect(deviceHandling(status)).toBe('none');
  });

  it('tells a consumable from something that goes back to stock', () => {
    expect(stockHandling('consumable')).toBe('confirmConsumed');
    expect(stockHandling('accessory')).toBe('takeBack');
    expect(stockHandling('component')).toBe('takeBack');
  });

  it('carries the owner, since the preparation is handed to them', () => {
    const [item] = recoveryPlan({
      devices: [
        {
          id: 'd1',
          deviceNo: 'DE-1',
          name: 'Laptop',
          status: 'inUse',
          ownerId: 'mia',
        },
      ],
      stock: [],
      entitlementSeats: [],
    });
    expect(item?.ownerId).toBe('mia');
    expect(item?.label).toBe('DE-1 / Laptop');
    expect(item?.handling).toBe('return');
  });

  it('keeps the account a reclaimed seat leaves behind', () => {
    const [seat] = recoveryPlan({
      devices: [],
      stock: [],
      entitlementSeats: [
        {
          id: 's1',
          name: 'Figma',
          account: 'zhang.san@example.com',
          ownerId: 'mia',
        },
      ],
    });
    expect(seat?.handling).toBe('reclaim');
    // Reclaiming is a register action; the account still signs in, so the
    // preparation has to carry it for the note the skill asks for.
    expect(seat?.account).toBe('zhang.san@example.com');
  });
});
