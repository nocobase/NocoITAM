// @vitest-environment node
import { LifecycleError } from '@nocobase/lifecycle';
import { createLifecycleTestKit } from '@nocobase/lifecycle/testing';
import { describe, expect, it, vi } from 'vitest';

import {
  auditTaskLifecycle,
  type AuditTaskTypes,
} from '../../server/lifecycles/audit-tasks.js';
import type { NotificationInput } from '../../server/providers/itam/notifier.js';

// A stocktake's lifecycle on its own (2026-10-19): started, counted to
// completed or to pending differences, settled, and cancelled while under
// way — with a memory store, a fake clock and the effect run in process. The
// items and devices are `repairs-audits-disposals.test.ts`'s.

const setup = () => {
  const sent: NotificationInput[] = [];
  const deliver = vi.fn(async (input: NotificationInput) => {
    sent.push(input);
  });
  const kit = createLifecycleTestKit<AuditTaskTypes>(auditTaskLifecycle, {
    services: { notifier: { notify: async () => undefined, deliver } },
    retries: 'clock',
  });
  const task = (status?: string) => {
    const record = kit.create({ name: 'Q4 count', plannedEnd: '2026-10-31' });
    return status ? kit.update(record, { status }) : record;
  };
  return { kit, sent, deliver, task };
};

const refusal = async (work: Promise<unknown>) => {
  const error = await work.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(LifecycleError);
  const { code, problems } = error as LifecycleError;
  return { code, field: problems[0]?.field };
};

describe('stocktake lifecycle', () => {
  it('tells the executors once started, retrying a failed delivery', async () => {
    const { kit, sent, deliver, task } = setup();
    const planned = task();
    deliver.mockRejectedValueOnce(new Error('inbox unreachable'));
    await kit.fire(
      planned,
      'start',
      {
        startedAt: '2026-10-19T09:00:00',
        executorIds: ['ann'],
        startedById: 'mia',
      },
      { actor: 'mia' },
    );
    expect(kit.get(planned)).toMatchObject({
      status: 'inProgress',
      startedAt: '2026-10-19T09:00:00',
    });
    expect(sent).toEqual([]);
    kit.advance({ minutes: 1 });
    await kit.runDue();
    expect(sent).toEqual([
      expect.objectContaining({
        to: ['ann'],
        actorId: 'mia',
        title: {
          key: 'notifications.auditStarted',
          params: { name: 'Q4 count' },
        },
        body: {
          key: 'notifications.auditStartedBody',
          params: { date: '2026-10-31' },
        },
      }),
    ]);
  });

  it('finishes straight to completed when nothing differs, else waits on the differences', async () => {
    const { kit, task } = setup();
    const clean = task('inProgress');
    await kit.fire(clean, 'finish', { differences: 0 });
    expect(kit.get(clean).status).toBe('completed');
    const differing = task('inProgress');
    await kit.fire(differing, 'finish', { differences: 2 });
    expect(kit.get(differing).status).toBe('pendingDifferences');
    await kit.fire(differing, 'settle', { completedAt: '2026-10-20T10:00:00' });
    expect(kit.get(differing)).toMatchObject({
      status: 'completed',
      completedAt: '2026-10-20T10:00:00',
    });
    expect(await kit.available(differing)).toEqual([]);
  });

  it('is cancelled only while under way, with a reason', async () => {
    const { kit, task } = setup();
    expect(
      (await refusal(kit.fire(task(), 'cancel', { cancelReason: 'x' }))).code,
    ).toBe('INVALID_STATE');
    const counting = task('inProgress');
    expect(await refusal(kit.fire(counting, 'cancel', {}))).toEqual({
      code: 'INVALID_INPUT',
      field: 'reason',
    });
    await kit.fire(counting, 'cancel', { cancelReason: 'Moved offices' });
    expect(kit.get(counting)).toMatchObject({
      status: 'cancelled',
      cancelReason: 'Moved offices',
    });
  });
});
