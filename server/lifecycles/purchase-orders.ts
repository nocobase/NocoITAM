import {
  defineEffect,
  defineLifecycle,
  type GuardVerdict,
  type JsonObject,
  type Lifecycle,
  type LifecycleRecord,
  type ParameterGroup,
  type TransitionContext,
} from '@nocobase/lifecycle';

import { requestTitle } from '../providers/itam/approvals.js';
import {
  approverRangeGroup,
  DEFAULT_APPROVER_RANGE,
  type ApproverRangeParameters,
} from './approver-range.js';
import type { Row } from '../providers/itam/collection-query.js';
import type { ItamNotifier } from '../providers/itam/notifier.js';

/**
 * A purchase order's lifecycle (2026-10-19, after the disposals'): draft → pendingApproval → approved →
 * ordered → partiallyReceived → completed, rejected as the side exit of the
 * decision, withdrawal back to draft, and cancelled from any step before
 * goods arrive. The runtime writes the state, its version and the log entry
 * in the procurement service's own transaction and refuses a stale or
 * concurrent move; the service writes what a move carries along — the
 * approval, the received devices, stock and seats, the timeline — in that
 * same transaction, and the approver and the owner are told through the
 * effects below, which are retried.
 *
 * Receiving is two transitions, because receiving more of an order already
 * partly received changes nothing about where it stands: `receivePartly`
 * moves an ordered order to partially received, and `complete` moves it on
 * once every line is in. The service fires whichever the lines call for.
 *
 * The names below are stored with every log entry and effect run: never
 * rename the lifecycle, a state, a transition or an effect casually.
 */

export const PURCHASE_ORDER_LIFECYCLE = 'purchaseOrders';

export type PurchaseOrderState =
  | 'draft'
  | 'pendingApproval'
  | 'approved'
  | 'rejected'
  | 'ordered'
  | 'partiallyReceived'
  | 'completed'
  | 'cancelled';

export interface PurchaseOrderRecord extends LifecycleRecord {
  readonly status: PurchaseOrderState;
  readonly orderNo?: unknown;
  readonly description?: unknown;
  readonly ownerId?: unknown;
  readonly createdById?: unknown;
}

export interface PurchaseOrderLifecycleServices {
  /**
   * The order's approval requests, newest first, read through the
   * transition's own transaction while one is decided.
   */
  approvals(orderId: string): Promise<readonly Row[]>;
  /** How many lines the order has, read the same way. */
  lineCount(orderId: string): Promise<number>;
  readonly notifier: ItamNotifier;
}

export interface PurchaseOrderTypes {
  record: PurchaseOrderRecord;
  state: PurchaseOrderState;
  parameters: ApproverRangeParameters;
  services: PurchaseOrderLifecycleServices;
}

/** 设置 → 流程 → 采购: whom a submitter may pick as the approver. */
export const purchaseOrderApproverRange: ParameterGroup = approverRangeGroup(
  'purchaseOrderApprovers',
);

type Context = TransitionContext<PurchaseOrderTypes>;

const text = (value: unknown): string =>
  typeof value === 'string'
    ? value
    : typeof value === 'number' || typeof value === 'bigint'
      ? String(value)
      : '';

const approverIdsOf = (approval: Row | undefined): readonly string[] =>
  Array.isArray(approval?.approverIds)
    ? (approval.approverIds as unknown[]).map(text)
    : [];

/**
 * The order belongs to its 负责人, or to whoever wrote it before handing it
 * over: asking for approval and taking the request back are theirs. Holding
 * the grant is not enough, since the permission set that grants `submit`
 * also grants `approve`.
 */
const raisedIt = ({ record, actor }: Context): boolean =>
  actor.id === text(record.ownerId) || actor.id === text(record.createdById);

const ownerOnly = (context: Context): GuardVerdict =>
  raisedIt(context) || {
    code: 'NOT_OWNER',
    message: 'Only the owner can edit, submit or withdraw this request',
  };

/** Only the approver the request names decides it. */
const approverOnly = async ({
  record,
  actor,
  services,
}: Context): Promise<GuardVerdict> => {
  const pending = (await services.approvals(text(record.id))).find(
    (approval) => approval.status === 'pending',
  );
  if (!pending)
    return {
      code: 'NOT_PENDING',
      message: 'No pending approval',
      kind: 'precondition',
    };
  const approvers = approverIdsOf(pending);
  return (
    approvers.length === 0 ||
    approvers.includes(actor.id) || {
      code: 'NOT_APPROVER',
      message: 'You are not an approver for this amount',
    }
  );
};

/**
 * Calling the order off is for the people it went through: the side that
 * raised it, and whoever was asked to decide or decided. A draft has no
 * approval, so it is its 负责人's alone.
 */
const involvedOnly = async (context: Context): Promise<GuardVerdict> => {
  if (raisedIt(context)) return true;
  const trail = await context.services.approvals(text(context.record.id));
  return (
    trail.some(
      (approval) =>
        text(approval.decidedById) === context.actor.id ||
        approverIdsOf(approval).includes(context.actor.id),
    ) || {
      code: 'NOT_INVOLVED',
      message: 'Only the owner or the approver can cancel this order',
    }
  );
};

/** Every transition is a write to the order. */
const touched = ({ now }: { readonly now: Date }) => ({ updatedAt: now });

const titleOf = (record: PurchaseOrderRecord): string =>
  requestTitle(record.orderNo, record.description);

/**
 * Who a move concerns travels in its input, which the log keeps with it:
 * submitting names the approver it asks and who asks, deciding names whom
 * to tell and who decided. An effect reads them there rather than from the
 * approval table, which a retry later may find changed.
 */
const people = (input: JsonObject, field: string): string[] => {
  const value = input[field];
  return (Array.isArray(value) ? value : [value]).map(text).filter(Boolean);
};

/** The approver it waits on is told, once the request is in. */
const notifyApprover = defineEffect<PurchaseOrderTypes>({
  name: 'purchaseOrders.notifyApprover',
  retry: { attempts: 5, backoffMs: 5_000, factor: 3 },
  timeoutMs: 60_000,
  async run({ record, input, services, idempotencyKey }) {
    await services.notifier.deliver({
      key: idempotencyKey,
      to: people(input, 'approverIds'),
      actorId: text(input.requestedById),
      title: {
        key: 'notifications.approvalRequested',
        params: { title: titleOf(record) },
      },
      body: { key: 'notifications.approvalBody', params: {} },
      url: `/procurement/${text(record.id)}`,
      source: { type: 'purchaseOrder', referenceId: text(record.id) },
    });
  },
});

/** The owner is told how it was decided, in the approver's words. */
const notifyDecision = defineEffect<PurchaseOrderTypes>({
  name: 'purchaseOrders.notifyDecision',
  retry: { attempts: 5, backoffMs: 5_000, factor: 3 },
  timeoutMs: 60_000,
  async run({ record, input, to, services, idempotencyKey }) {
    await services.notifier.deliver({
      key: idempotencyKey,
      to: people(input, 'ownerId'),
      actorId: text(input.decidedById),
      title: {
        key:
          to === 'approved'
            ? 'notifications.approvalApproved'
            : 'notifications.approvalRejected',
        params: { title: titleOf(record) },
      },
      // The approver's own sentence, passed through as written.
      body: { text: text(input.comment) },
      url: `/procurement/${text(record.id)}`,
      source: { type: 'purchaseOrder', referenceId: text(record.id) },
    });
  },
});

export const purchaseOrderLifecycle: Lifecycle<PurchaseOrderTypes> =
  defineLifecycle<PurchaseOrderTypes>({
    name: PURCHASE_ORDER_LIFECYCLE,
    initial: 'draft',
    parameters: { approverRange: DEFAULT_APPROVER_RANGE },
    parameterConfiguration: {
      readMode: 'live',
      groups: [purchaseOrderApproverRange],
    },
    states: [
      'draft',
      'pendingApproval',
      'approved',
      'rejected',
      'ordered',
      'partiallyReceived',
      { name: 'completed', final: true },
      { name: 'cancelled', final: true },
    ],
    transitions: {
      submit: {
        title: 'Submit',
        from: ['draft', 'rejected'],
        to: 'pendingApproval',
        guard: async (context) => {
          const owner = ownerOnly(context);
          if (owner !== true) return owner;
          return (
            (await context.services.lineCount(text(context.record.id))) > 0 || {
              code: 'NO_LINES',
              message: 'Add at least one line before submitting',
              kind: 'precondition',
            }
          );
        },
        set: touched,
      },
      withdraw: {
        title: 'Withdraw',
        from: 'pendingApproval',
        to: 'draft',
        guard: ownerOnly,
        set: touched,
      },
      approve: {
        title: 'Approve',
        from: 'pendingApproval',
        to: 'approved',
        guard: approverOnly,
        set: touched,
        effects: [notifyDecision],
      },
      reject: {
        title: 'Reject',
        from: 'pendingApproval',
        to: 'rejected',
        guard: approverOnly,
        set: touched,
        effects: [notifyDecision],
      },
      // Placing the order is the buyer's step: the grant decides who.
      order: {
        title: 'Order',
        from: 'approved',
        to: 'ordered',
        accept: ['orderedAt', 'expectedAt'],
        set: touched,
      },
      receivePartly: {
        title: 'Receive part',
        from: 'ordered',
        to: 'partiallyReceived',
        set: touched,
      },
      complete: {
        title: 'Receive all',
        from: ['ordered', 'partiallyReceived'],
        to: 'completed',
        accept: ['receivedAt'],
        set: touched,
      },
      // Not from rejected: that order waits on nothing, and its owner's move
      // is to fix it and ask again. Not once goods have arrived.
      cancel: {
        title: 'Cancel',
        from: ['draft', 'pendingApproval', 'approved', 'ordered'],
        to: 'cancelled',
        guard: involvedOnly,
        validate: (input) =>
          text(input.cancelReason).trim()
            ? null
            : [{ field: 'cancelReason', message: 'A reason is required' }],
        accept: ['cancelReason'],
        set: touched,
      },
    },
    onEnter: { pendingApproval: [notifyApprover] },
  });
