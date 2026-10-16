import {
  defineEffect,
  defineLifecycle,
  type GuardVerdict,
  type JsonObject,
  type Lifecycle,
  type LifecycleRecord,
  type TransitionContext,
} from '@nocobase/lifecycle';

import { requestTitle } from '../providers/itam/approvals.js';
import type { Row } from '../providers/itam/collection-query.js';
import type { ItamNotifier } from '../providers/itam/notifier.js';

/**
 * A disposal's lifecycle (2026-10-18, the pilot of
 * docs/adr/0001-record-lifecycles.md): draft → pendingApproval → approved →
 * executed, rejected as the side exit, and withdrawal back to draft. The
 * runtime writes the state, its version and the log entry in the disposal
 * service's own transaction, and refuses a stale or concurrent decision; the
 * service does what a transition carries along in that same transaction —
 * the approval request, reclaiming what the devices hold, moving the
 * devices, the timeline — and tells people after commit through the
 * effects below, which are retried.
 *
 * The names below are stored with every log entry and effect run: never
 * rename the lifecycle, a state, a transition or an effect casually (see
 * `.agents/skills/nocobase-app-development/references/lifecycle.md`,
 * "Changing a definition in production").
 */

export const DISPOSAL_LIFECYCLE = 'disposals';

export type DisposalState =
  'draft' | 'pendingApproval' | 'approved' | 'rejected' | 'executed';

export interface DisposalRecord extends LifecycleRecord {
  readonly status: DisposalState;
  readonly disposalNo?: unknown;
  readonly description?: unknown;
  readonly ownerId?: unknown;
  readonly createdById?: unknown;
  readonly deviceCount?: unknown;
}

export interface DisposalLifecycleServices {
  /**
   * The disposal's approval requests, newest first, read through the
   * transition's own transaction while one is decided (a guard reading
   * through the database manager would wait forever on SQLite's single
   * connection).
   */
  approvals(disposalId: string): Promise<readonly Row[]>;
  readonly notifier: ItamNotifier;
}

export interface DisposalTypes {
  record: DisposalRecord;
  state: DisposalState;
  services: DisposalLifecycleServices;
}

type Context = TransitionContext<DisposalTypes>;

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
 * Asking for approval, and taking the request back, belong to the
 * disposal's 负责人, or to whoever wrote it before handing it over: holding
 * `submit` is not enough, since the permission set that grants it also
 * grants `approve` (the same rule as a purchase order).
 */
const ownerOnly = ({ record, actor }: Context): GuardVerdict =>
  actor.id === text(record.ownerId) ||
  actor.id === text(record.createdById) || {
    code: 'NOT_OWNER',
    message: 'Only the owner can submit or withdraw this request',
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
 * Carrying it out is for the people the request went through: the side that
 * raised it, and whoever was asked to decide or decided.
 */
const involvedOnly = async (context: Context): Promise<GuardVerdict> => {
  if (ownerOnly(context) === true) return true;
  const trail = await context.services.approvals(text(context.record.id));
  return (
    trail.some(
      (approval) =>
        text(approval.decidedById) === context.actor.id ||
        approverIdsOf(approval).includes(context.actor.id),
    ) || {
      code: 'NOT_INVOLVED',
      message: 'Only the owner or the approver can carry out this disposal',
    }
  );
};

/** Every transition is a write to the record. */
const touched = ({ now }: { readonly now: Date }) => ({ updatedAt: now });

const titleOf = (record: DisposalRecord): string =>
  requestTitle(record.disposalNo, record.description);

/**
 * Who a move concerns travels in its input, which the log keeps with it:
 * submitting names the approver it asks and who asks, deciding names who
 * asked and who decided. An effect reads them there rather than from the
 * approval table, which a retry an hour later may find changed.
 */
const people = (input: JsonObject, field: string): string[] => {
  const value = input[field];
  return (Array.isArray(value) ? value : [value]).map(text).filter(Boolean);
};

/** The approver it waits on is told, once the request is in. */
const notifyApprover = defineEffect<DisposalTypes>({
  name: 'disposals.notifyApprover',
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
      url: `/disposals/${text(record.id)}`,
      source: { type: 'disposal', referenceId: text(record.id) },
    });
  },
});

/** Whoever asked is told how it was decided, in the approver's words. */
const notifyDecision = defineEffect<DisposalTypes>({
  name: 'disposals.notifyDecision',
  retry: { attempts: 5, backoffMs: 5_000, factor: 3 },
  timeoutMs: 60_000,
  async run({ record, input, to, services, idempotencyKey }) {
    await services.notifier.deliver({
      key: idempotencyKey,
      to: people(input, 'requestedById'),
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
      url: `/disposals/${text(record.id)}`,
      source: { type: 'disposal', referenceId: text(record.id) },
    });
  },
});

/** What carrying it out writes onto the disposal with its state. */
export const EXECUTION_FIELDS = [
  'disposedAt',
  'proceeds',
  'expenses',
  'currency',
  'recipientVendorId',
  'recipientName',
  'dataWipe',
  'wipeMethod',
  'executedById',
] as const;

export const disposalLifecycle: Lifecycle<DisposalTypes> =
  defineLifecycle<DisposalTypes>({
    name: DISPOSAL_LIFECYCLE,
    initial: 'draft',
    states: [
      'draft',
      'pendingApproval',
      'approved',
      'rejected',
      { name: 'executed', final: true },
    ],
    transitions: {
      submit: {
        title: 'Submit',
        from: ['draft', 'rejected'],
        to: 'pendingApproval',
        guard: (context) => {
          const owner = ownerOnly(context);
          if (owner !== true) return owner;
          return (
            Number(context.record.deviceCount ?? 0) > 0 || {
              code: 'NO_DEVICES',
              message: 'Add at least one device before submitting',
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
      execute: {
        title: 'Execute',
        from: 'approved',
        to: 'executed',
        guard: involvedOnly,
        accept: [...EXECUTION_FIELDS],
        set: touched,
      },
    },
    onEnter: { pendingApproval: [notifyApprover] },
  });
