import {
  defineEffect,
  defineLifecycle,
  type JsonObject,
  type Lifecycle,
  type LifecycleRecord,
} from '@nocobase/lifecycle';

import type { ItamNotifier } from '../providers/itam/notifier.js';

/**
 * A stocktake's lifecycle (2026-10-19, after the disposals', purchase
 * orders' and repairs'): not started →
 * in progress → pending differences → completed, and cancelled while it is
 * under way. Starting snapshots the devices in scope; finishing the count
 * goes straight to completed when nothing differs, else to pending
 * differences, which `settle` completes once every difference is resolved.
 * The runtime writes the state, its version and the log entry in the audit
 * service's own transaction; the service writes the items, the devices'
 * corrections and the timeline in that same transaction. Who may do each is
 * the grant's, as it was. The executors are told the count has started
 * through the effect below, which is retried.
 *
 * The names below are stored with every log entry and effect run: never
 * rename the lifecycle, a state, a transition or an effect casually.
 */

export const AUDIT_TASK_LIFECYCLE = 'auditTasks';

export type AuditTaskState =
  | 'notStarted'
  | 'inProgress'
  | 'pendingDifferences'
  | 'completed'
  | 'cancelled';

export interface AuditTaskRecord extends LifecycleRecord {
  readonly status: AuditTaskState;
  readonly name?: unknown;
  readonly plannedEnd?: unknown;
}

export interface AuditTaskLifecycleServices {
  readonly notifier: ItamNotifier;
}

export interface AuditTaskTypes {
  record: AuditTaskRecord;
  state: AuditTaskState;
  services: AuditTaskLifecycleServices;
}

const text = (value: unknown): string =>
  typeof value === 'string'
    ? value
    : typeof value === 'number' || typeof value === 'bigint'
      ? String(value)
      : '';

const people = (input: JsonObject, field: string): string[] => {
  const value = input[field];
  return (Array.isArray(value) ? value : [value]).map(text).filter(Boolean);
};

/**
 * The executors are told the count has started and by when it is due. Who
 * they are travels in the start's input, which the log keeps with it.
 */
const notifyExecutors = defineEffect<AuditTaskTypes>({
  name: 'auditTasks.notifyExecutors',
  retry: { attempts: 5, backoffMs: 5_000, factor: 3 },
  timeoutMs: 60_000,
  async run({ record, input, services, idempotencyKey }) {
    await services.notifier.deliver({
      key: idempotencyKey,
      to: people(input, 'executorIds'),
      actorId: text(input.startedById),
      title: {
        key: 'notifications.auditStarted',
        params: { name: text(record.name) },
      },
      body: {
        key: 'notifications.auditStartedBody',
        params: { date: text(record.plannedEnd) },
      },
      url: `/audits/${text(record.id)}`,
      source: { type: 'auditTask', referenceId: text(record.id) },
    });
  },
});

/** Every transition is a write to the task. */
const touched = ({ now }: { readonly now: Date }) => ({ updatedAt: now });

export const auditTaskLifecycle: Lifecycle<AuditTaskTypes> =
  defineLifecycle<AuditTaskTypes>({
    name: AUDIT_TASK_LIFECYCLE,
    initial: 'notStarted',
    states: [
      'notStarted',
      'inProgress',
      'pendingDifferences',
      { name: 'completed', final: true },
      { name: 'cancelled', final: true },
    ],
    transitions: {
      start: {
        title: 'Start',
        from: 'notStarted',
        to: 'inProgress',
        accept: ['startedAt'],
        set: touched,
        effects: [notifyExecutors],
      },
      // The count closed: completed when nothing differs, else the
      // differences wait to be resolved.
      finish: {
        title: 'Finish counting',
        from: 'inProgress',
        to: ['completed', 'pendingDifferences'],
        route: ({ input }) =>
          Number(input.differences ?? 0) > 0
            ? 'pendingDifferences'
            : 'completed',
        accept: ['completedAt'],
        set: touched,
      },
      settle: {
        title: 'Resolve the differences',
        from: 'pendingDifferences',
        to: 'completed',
        accept: ['completedAt'],
        set: touched,
      },
      // A task not started yet has nothing to call off: it is deleted.
      cancel: {
        title: 'Cancel',
        from: ['inProgress', 'pendingDifferences'],
        to: 'cancelled',
        validate: (input) =>
          text(input.cancelReason).trim()
            ? null
            : [{ field: 'reason', message: 'reason is required' }],
        accept: ['cancelReason'],
        set: touched,
      },
    },
  });
