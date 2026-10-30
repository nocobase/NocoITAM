// @vitest-environment node
import { LifecycleError } from '@nocobase/lifecycle';
import { createLifecycleTestKit } from '@nocobase/lifecycle/testing';
import { describe, expect, it, vi } from 'vitest';

import {
  purchaseOrderLifecycle,
  type PurchaseOrderTypes,
} from '../../server/lifecycles/purchase-orders.js';
import type { Row } from '../../server/providers/itam/collection-query.js';
import type { NotificationInput } from '../../server/providers/itam/notifier.js';

// A purchase order's lifecycle on its own (2026-10-19): who may move it, from
// where, and what it tells people once a move commits — with a memory store,
// a fake clock and the effects run in process. The service around it
// (approvals, receiving) is `procurement.test.ts`'s.

function setup(options: { approvals?: Row[]; lines?: number } = {}) {
  const approvals: Row[] = options.approvals ?? [];
  const sent: NotificationInput[] = [];
  const deliver = vi.fn(async (input: NotificationInput) => {
    sent.push(input);
  });
  const kit = createLifecycleTestKit<PurchaseOrderTypes>(
    purchaseOrderLifecycle,
    {
      services: {
        approvals: async () => approvals,
        lineCount: async () => options.lines ?? 2,
        notifier: { notify: async () => undefined, deliver },
      },
      retries: 'clock',
    },
  );
  // An order already in a state: the kit creates every record in the
  // initial one, and `update` places it where the test starts.
  const order = ({ status, ...values }: Row = {}) => {
    const record = kit.create({
      orderNo: 'PO-000001',
      description: 'Laptops',
      ownerId: 'mia',
      createdById: 'mia',
      ...values,
    });
    return status ? kit.update(record, { status }) : record;
  };
  return { kit, approvals, sent, deliver, order };
}

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

describe('purchase order lifecycle', () => {
  it('lets only its owner or writer submit it, and only with lines', async () => {
    const empty = setup({ lines: 0 });
    expect(
      await refusal(
        empty.kit.fire(empty.order(), 'submit', {}, { actor: 'mia' }),
      ),
    ).toMatchObject({ code: 'GUARD_REJECTED', rule: 'NO_LINES' });
    const { kit, order } = setup();
    const draft = order();
    expect(
      await refusal(kit.fire(draft, 'submit', {}, { actor: 'sam' })),
    ).toMatchObject({ code: 'GUARD_REJECTED', rule: 'NOT_OWNER' });
    await kit.fire(draft, 'submit', {}, { actor: 'mia' });
    expect(kit.get(draft).status).toBe('pendingApproval');
  });

  it('tells the approver once submitted, retrying a failed delivery', async () => {
    const { kit, sent, deliver, order } = setup();
    const draft = order();
    deliver.mockRejectedValueOnce(new Error('inbox unreachable'));
    await kit.fire(
      draft,
      'submit',
      { approverIds: ['ann'], requestedById: 'mia' },
      { actor: 'mia' },
    );
    expect(sent).toEqual([]);
    kit.advance({ minutes: 1 });
    await kit.runDue();
    expect(sent).toEqual([
      expect.objectContaining({
        to: ['ann'],
        actorId: 'mia',
        title: {
          key: 'notifications.approvalRequested',
          params: { title: 'PO-000001 Laptops' },
        },
        url: `/purchases/${String(draft.id)}`,
      }),
    ]);
  });

  it('is decided only by the approver it names, who tells the owner in their own words', async () => {
    const { kit, approvals, sent, order } = setup();
    const waiting = order({ status: 'pendingApproval' });
    approvals.push({ status: 'pending', approverIds: ['ann'] });
    expect(
      await refusal(kit.fire(waiting, 'approve', {}, { actor: 'sam' })),
    ).toMatchObject({ code: 'GUARD_REJECTED', rule: 'NOT_APPROVER' });
    await kit.fire(
      waiting,
      'approve',
      { comment: 'Go ahead', ownerId: 'mia', decidedById: 'ann' },
      { actor: 'ann' },
    );
    expect(kit.get(waiting).status).toBe('approved');
    expect(sent.at(-1)).toEqual(
      expect.objectContaining({
        to: ['mia'],
        actorId: 'ann',
        title: {
          key: 'notifications.approvalApproved',
          params: { title: 'PO-000001 Laptops' },
        },
        body: { text: 'Go ahead' },
      }),
    );
  });

  it('is ordered, received in part and then in full, with the dates it states', async () => {
    const { kit, order } = setup();
    const approved = order({ status: 'approved' });
    await kit.fire(
      approved,
      'order',
      { orderedAt: '2026-10-19', expectedAt: '2026-10-30' },
      { actor: 'lee' },
    );
    expect(kit.get(approved)).toMatchObject({
      status: 'ordered',
      orderedAt: '2026-10-19',
      expectedAt: '2026-10-30',
    });
    await kit.fire(approved, 'receivePartly', {}, { actor: 'lee' });
    await kit.fire(
      approved,
      'complete',
      { receivedAt: '2026-10-31' },
      { actor: 'lee' },
    );
    expect(kit.get(approved)).toMatchObject({
      status: 'completed',
      receivedAt: '2026-10-31',
    });
    expect(await kit.available(approved, 'mia')).toEqual([]);
    // Nothing is received before it is ordered.
    expect(
      (await refusal(kit.fire(order({ status: 'approved' }), 'complete', {})))
        .code,
    ).toBe('INVALID_STATE');
  });

  it('is cancelled only before goods arrive, with a reason, by the people it went through', async () => {
    const { kit, order } = setup({
      approvals: [
        { status: 'approved', approverIds: ['ann'], decidedById: 'ann' },
      ],
    });
    const ordered = order({ status: 'ordered' });
    expect(
      await refusal(kit.fire(ordered, 'cancel', {}, { actor: 'mia' })),
    ).toMatchObject({ code: 'INVALID_INPUT', field: 'cancelReason' });
    expect(
      await refusal(
        kit.fire(ordered, 'cancel', { cancelReason: 'x' }, { actor: 'sam' }),
      ),
    ).toMatchObject({ code: 'GUARD_REJECTED', rule: 'NOT_INVOLVED' });
    await kit.fire(
      ordered,
      'cancel',
      { cancelReason: 'Vendor out of stock' },
      { actor: 'ann' },
    );
    expect(kit.get(ordered)).toMatchObject({
      status: 'cancelled',
      cancelReason: 'Vendor out of stock',
    });
    for (const status of ['rejected', 'partiallyReceived'])
      expect(
        (
          await refusal(
            kit.fire(
              order({ status }),
              'cancel',
              { cancelReason: 'x' },
              { actor: 'mia' },
            ),
          )
        ).code,
      ).toBe('INVALID_STATE');
  });
});
