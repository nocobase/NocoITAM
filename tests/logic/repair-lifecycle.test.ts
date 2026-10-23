// @vitest-environment node
import { LifecycleError } from '@nocobase/lifecycle';
import { createLifecycleTestKit } from '@nocobase/lifecycle/testing';
import { describe, expect, it } from 'vitest';

import {
  repairLifecycle,
  type RepairTypes,
} from '../../server/lifecycles/repairs.js';

// A repair's lifecycle on its own (2026-10-19): its result is its state —
// in progress, then repaired, unrepairable or replaced, correctable among
// the three and never back. The device it moves is
// `repairs-audits-disposals.test.ts`'s.

const setup = () => {
  const kit = createLifecycleTestKit<RepairTypes>(repairLifecycle);
  const repair = (values: Record<string, unknown> = {}) =>
    kit.create({ repairNo: 'RP-000001', ownerId: 'mia', ...values });
  return { kit, repair };
};

const refusal = async (work: Promise<unknown>) => {
  const error = await work.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(LifecycleError);
  const { code, blockers, problems } = error as LifecycleError;
  return {
    code,
    rule: blockers.find((b) => b.source === 'guard')?.code,
    field: problems[0]?.field,
  };
};

describe('repair lifecycle', () => {
  it('is filed in progress and completed by its owner or a supervisor, with what it states', async () => {
    const { kit, repair } = setup();
    const filed = repair();
    expect(kit.get(filed).result).toBe('inProgress');
    expect(
      await refusal(
        kit.fire(filed, 'complete', { result: 'repaired' }, { actor: 'sam' }),
      ),
    ).toMatchObject({ code: 'GUARD_REJECTED', rule: 'NOT_OWNER' });
    // A supervisor may close one somebody else follows.
    await kit.fire(
      filed,
      'complete',
      {
        result: 'unrepairable',
        supervises: true,
        actualReturnAt: '2026-10-19',
        cost: 120,
      },
      { actor: 'sam' },
    );
    expect(kit.get(filed)).toMatchObject({
      result: 'unrepairable',
      actualReturnAt: '2026-10-19',
      cost: 120,
    });
  });

  it('refuses a result that is not one, and completing twice', async () => {
    const { kit, repair } = setup();
    const filed = repair();
    expect(
      await refusal(
        kit.fire(filed, 'complete', { result: 'inProgress' }, { actor: 'mia' }),
      ),
    ).toMatchObject({ code: 'INVALID_INPUT', field: 'result' });
    await kit.fire(filed, 'complete', { result: 'repaired' }, { actor: 'mia' });
    expect(
      (
        await refusal(
          kit.fire(filed, 'complete', { result: 'replaced' }, { actor: 'mia' }),
        )
      ).code,
    ).toBe('INVALID_STATE');
  });

  it('corrects a finished result among the endings, never back to in progress', async () => {
    const { kit, repair } = setup();
    const filed = repair();
    expect(
      (await refusal(kit.fire(filed, 'correct', { result: 'repaired' }))).code,
    ).toBe('INVALID_STATE');
    await kit.fire(filed, 'complete', { result: 'repaired' }, { actor: 'mia' });
    await kit.fire(filed, 'correct', { result: 'replaced' }, { actor: 'lee' });
    expect(kit.get(filed).result).toBe('replaced');
    expect(
      await refusal(
        kit.fire(filed, 'correct', { result: 'inProgress' }, { actor: 'lee' }),
      ),
    ).toMatchObject({ code: 'INVALID_INPUT', field: 'result' });
    expect(await kit.history(filed)).toEqual(['complete', 'correct']);
  });

  // Not carried out (2026-10-23): ended as cancelled, which a correction may
  // also reach or leave.
  it('ends a repair that was not carried out as cancelled', async () => {
    const { kit, repair } = setup();
    const filed = repair();
    await kit.fire(
      filed,
      'complete',
      { result: 'cancelled' },
      { actor: 'mia' },
    );
    expect(kit.get(filed).result).toBe('cancelled');
    await kit.fire(
      filed,
      'correct',
      { result: 'unrepairable' },
      { actor: 'lee' },
    );
    expect(kit.get(filed).result).toBe('unrepairable');
  });
});
