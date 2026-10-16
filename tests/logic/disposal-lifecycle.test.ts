// @vitest-environment node
import { LifecycleError } from '@nocobase/lifecycle';
import { createLifecycleTestKit } from '@nocobase/lifecycle/testing';
import { describe, expect, it, vi } from 'vitest';

import {
  disposalLifecycle,
  type DisposalTypes,
} from '../../server/lifecycles/disposals.js';
import type { Row } from '../../server/providers/itam/collection-query.js';
import type { NotificationInput } from '../../server/providers/itam/notifier.js';

// A disposal's lifecycle on its own (2026-10-18): who may move it, from
// where, and what it tells people once a move commits — with a memory store,
// a fake clock and the effects run in process, so a refusal, a retry and a
// failure need no database. The service around it (approvals, devices) is
// `repairs-audits-disposals.test.ts`'s.

function setup(options: { readonly approvals?: Row[] } = {}) {
  const approvals: Row[] = options.approvals ?? [];
  const sent: NotificationInput[] = [];
  const deliver = vi.fn(async (input: NotificationInput) => {
    sent.push(input);
  });
  const kit = createLifecycleTestKit<DisposalTypes>(disposalLifecycle, {
    services: {
      approvals: async () => approvals,
      notifier: { notify: async () => undefined, deliver },
    },
    retries: 'clock',
  });
  // A disposal already in a state: the kit creates every record in the
  // initial one, and `update` places it where the test starts.
  const draft = ({ status, ...values }: Row = {}) => {
    const record = kit.create({
      disposalNo: 'DP-000001',
      description: 'Old laptops',
      ownerId: 'mia',
      createdById: 'mia',
      deviceCount: 2,
      ...values,
    });
    return status ? kit.update(record, { status }) : record;
  };
  return { kit, approvals, sent, deliver, draft };
}

const refusal = async (work: Promise<unknown>) => {
  const error = await work.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(LifecycleError);
  const { code, blockers } = error as LifecycleError;
  return { code, rule: blockers.find((b) => b.source === 'guard')?.code };
};

describe('disposal lifecycle', () => {
  it('lets only its owner or writer submit it, and only with devices listed', async () => {
    const { kit, draft } = setup();
    const empty = draft({ deviceCount: 0 });
    expect(
      await refusal(kit.fire(empty, 'submit', {}, { actor: 'mia' })),
    ).toEqual({ code: 'GUARD_REJECTED', rule: 'NO_DEVICES' });
    const listed = draft();
    expect(
      await refusal(kit.fire(listed, 'submit', {}, { actor: 'sam' })),
    ).toEqual({ code: 'GUARD_REJECTED', rule: 'NOT_OWNER' });
    await kit.fire(listed, 'submit', {}, { actor: 'mia' });
    expect(kit.get(listed).status).toBe('pendingApproval');
  });

  it('tells the approver it waits on once submitted, and retries a failed delivery', async () => {
    const { kit, approvals, sent, deliver, draft } = setup();
    const disposal = draft();
    approvals.push({
      status: 'pending',
      approverIds: ['ann'],
      requestedById: 'mia',
    });
    deliver.mockRejectedValueOnce(new Error('inbox unreachable'));
    await kit.fire(
      disposal,
      'submit',
      { approverIds: ['ann'], requestedById: 'mia' },
      { actor: 'mia' },
    );
    // The first try failed; the run waits for its backoff.
    expect(sent).toEqual([]);
    kit.advance({ minutes: 1 });
    await kit.runDue();
    expect(sent).toEqual([
      expect.objectContaining({
        to: ['ann'],
        actorId: 'mia',
        title: {
          key: 'notifications.approvalRequested',
          params: { title: 'DP-000001 Old laptops' },
        },
        url: `/disposals/${String(disposal.id)}`,
      }),
    ]);
    expect(await kit.effects(disposal)).toEqual(['disposals.notifyApprover']);
  });

  it('is decided only by the approver it names, who tells the requester in their own words', async () => {
    const { kit, approvals, sent, draft } = setup();
    const disposal = draft({ status: 'pendingApproval' });
    approvals.push({
      status: 'pending',
      approverIds: ['ann'],
      requestedById: 'mia',
    });
    expect(
      await refusal(kit.fire(disposal, 'approve', {}, { actor: 'sam' })),
    ).toEqual({ code: 'GUARD_REJECTED', rule: 'NOT_APPROVER' });
    // The service names who asked and who decided, as it fires.
    await kit.fire(
      disposal,
      'reject',
      { comment: 'Repair it first', requestedById: 'mia', decidedById: 'ann' },
      { actor: 'ann' },
    );
    expect(kit.get(disposal).status).toBe('rejected');
    expect(sent.at(-1)).toEqual(
      expect.objectContaining({
        to: ['mia'],
        actorId: 'ann',
        title: {
          key: 'notifications.approvalRejected',
          params: { title: 'DP-000001 Old laptops' },
        },
        body: { text: 'Repair it first' },
      }),
    );
  });

  it('cannot be decided with no request open', async () => {
    const { kit, draft } = setup();
    const disposal = draft({ status: 'pendingApproval' });
    expect(
      await refusal(kit.fire(disposal, 'approve', {}, { actor: 'ann' })),
    ).toEqual({ code: 'GUARD_REJECTED', rule: 'NOT_PENDING' });
  });

  it('is carried out only once approved, by the people the request went through, with what it states', async () => {
    const { kit, approvals, draft } = setup({
      approvals: [
        { status: 'approved', approverIds: ['ann'], decidedById: 'ann' },
      ],
    });
    const open = draft();
    expect(
      (await refusal(kit.fire(open, 'execute', {}, { actor: 'mia' }))).code,
    ).toBe('INVALID_STATE');
    const disposal = draft({ status: 'approved' });
    expect(
      await refusal(kit.fire(disposal, 'execute', {}, { actor: 'sam' })),
    ).toEqual({ code: 'GUARD_REJECTED', rule: 'NOT_INVOLVED' });
    expect(approvals).toHaveLength(1);
    await kit.fire(
      disposal,
      'execute',
      { disposedAt: '2026-10-18', dataWipe: 'wiped', wipeMethod: 'erase' },
      { actor: 'ann' },
    );
    expect(kit.get(disposal)).toMatchObject({
      status: 'executed',
      disposedAt: '2026-10-18',
      dataWipe: 'wiped',
      wipeMethod: 'erase',
    });
    // Executed is final: nothing leaves it.
    expect(await kit.available(disposal, 'ann')).toEqual([]);
  });

  it('goes back to draft when its owner withdraws it', async () => {
    const { kit, draft } = setup();
    const disposal = draft({ status: 'pendingApproval' });
    expect(
      await refusal(kit.fire(disposal, 'withdraw', {}, { actor: 'ann' })),
    ).toEqual({ code: 'GUARD_REJECTED', rule: 'NOT_OWNER' });
    await kit.fire(disposal, 'withdraw', {}, { actor: 'mia' });
    expect(kit.get(disposal).status).toBe('draft');
    expect(await kit.history(disposal)).toEqual(['withdraw']);
  });
});
