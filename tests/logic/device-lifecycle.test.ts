// @vitest-environment node
import { LifecycleError } from '@nocobase/lifecycle';
import { createLifecycleTestKit } from '@nocobase/lifecycle/testing';
import { describe, expect, it } from 'vitest';

import {
  deviceLifecycle,
  type DeviceTypes,
} from '../../server/lifecycles/devices.js';
import {
  DEVICE_STATUSES,
  OPERATION_FROM,
  type DeviceStatus,
} from '../../server/providers/itam/device-status.js';

// A device's lifecycle on its own (2026-10-19): the single-device state
// machine, built from `OPERATION_FROM`. What each move carries along — the
// holder, the ledger, the timeline — is `devices.test.ts`'s.

const setup = () => {
  const kit = createLifecycleTestKit<DeviceTypes>(deviceLifecycle);
  const device = (status: DeviceStatus = 'inStock', values = {}) => {
    const created = kit.create({ deviceNo: 'DE-000001', ...values });
    if (status !== 'inStock') kit.update(created, { status });
    return created;
  };
  return { kit, device };
};

const refusal = async (work: Promise<unknown>) => {
  const error = await work.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(LifecycleError);
  const { code, problems } = error as LifecycleError;
  return { code, field: problems[0]?.field };
};

describe('device lifecycle', () => {
  it('lets each operation start exactly where OPERATION_FROM says', async () => {
    const { kit, device } = setup();
    const input: Record<string, Record<string, unknown>> = {
      correct: { status: 'inStock', reason: 'x' },
    };
    for (const [operation, allowed] of Object.entries(OPERATION_FROM))
      for (const state of DEVICE_STATUSES) {
        const record = device(state);
        const fired = kit.fire(record, operation, input[operation] ?? {}, {
          actor: 'mia',
        });
        if (allowed.includes(state)) await fired;
        else
          expect(await refusal(fired)).toMatchObject({
            code: 'INVALID_STATE',
          });
      }
  });

  it('starts in stock, goes out and comes back where the return says', async () => {
    const { kit } = setup();
    const laptop = await kit.start({ deviceNo: 'DE-000002' }, { actor: 'mia' });
    expect(kit.get(laptop).status).toBe('inStock');
    await kit.fire(laptop, 'assign', {}, { actor: 'mia' });
    // A transfer keeps it in use and moves the version on.
    const before = kit.get(laptop).lifecycleVersion;
    await kit.fire(laptop, 'transfer', {}, { actor: 'mia' });
    expect(kit.get(laptop)).toMatchObject({ status: 'inUse' });
    expect(kit.get(laptop).lifecycleVersion).toBe(Number(before) + 1);
    expect(
      await refusal(
        kit.fire(laptop, 'return', { nextStatus: 'lost' }, { actor: 'mia' }),
      ),
    ).toMatchObject({ code: 'INVALID_INPUT', field: 'nextStatus' });
    await kit.fire(
      laptop,
      'return',
      { nextStatus: 'retired' },
      { actor: 'mia' },
    );
    expect(kit.get(laptop).status).toBe('retired');
    expect(await kit.history(laptop)).toEqual([
      '$create',
      'assign',
      'transfer',
      'return',
    ]);
  });

  it('comes back from repair to whoever still holds it', async () => {
    const { kit, device } = setup();
    const held = device('inRepair', { assigneeId: 'p1' });
    const lent = device('inRepair', {
      assigneeId: 'p1',
      expectedReturnDate: '2026-11-01',
    });
    const shelf = device('inRepair');
    for (const record of [held, lent, shelf])
      await kit.fire(record, 'repairDone', {}, { actor: 'mia' });
    expect([held, lent, shelf].map((r) => kit.get(r).status)).toEqual([
      'inUse',
      'onLoan',
      'inStock',
    ]);
  });

  it('corrects with a reason, never into or out of disposed', async () => {
    const { kit, device } = setup();
    const lost = device('lost');
    expect(
      await refusal(
        kit.fire(lost, 'correct', { status: 'inUse' }, { actor: 'mia' }),
      ),
    ).toMatchObject({ code: 'INVALID_INPUT', field: 'reason' });
    expect(
      await refusal(
        kit.fire(
          lost,
          'correct',
          { status: 'disposed', reason: 'gone' },
          { actor: 'mia' },
        ),
      ),
    ).toMatchObject({ code: 'INVALID_INPUT', field: 'status' });
    await kit.fire(
      lost,
      'correct',
      { status: 'inUse', reason: 'found on a desk' },
      { actor: 'mia' },
    );
    expect(kit.get(lost).status).toBe('inUse');
    const gone = device('disposed');
    expect(
      await refusal(
        kit.fire(
          gone,
          'correct',
          { status: 'inStock', reason: 'back' },
          { actor: 'mia' },
        ),
      ),
    ).toMatchObject({ code: 'INVALID_STATE' });
  });

  it('leaves repair and disposal moves to the other domains', () => {
    const manual = Object.fromEntries(
      [...deviceLifecycle.transitions].map(([name, t]) => [name, t.manual]),
    );
    expect(manual).toMatchObject({
      sendToRepair: false,
      repairDone: false,
      markPendingDisposal: false,
      dispose: false,
      assign: true,
      correct: true,
    });
  });
});
