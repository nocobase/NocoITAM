import {
  defineLifecycle,
  type Lifecycle,
  type LifecycleRecord,
  type TransitionContext,
} from '@nocobase/lifecycle';

import {
  CORRECTABLE_STATUSES,
  DEVICE_STATUSES,
  OPERATION_FROM,
  RETURN_TARGETS,
  type DeviceStatus,
} from '../providers/itam/device-status.js';

/**
 * A device's lifecycle (2026-10-19, after the four documents'): the single-device state machine,
 * from stock through use, loan, repair, retirement and
 * loss to pending disposal and disposed. Where each move may start is still
 * `OPERATION_FROM` (`server/providers/itam/device-status.ts`), which the
 * assistant's plans check against too; this definition is built from it, so
 * the two never differ.
 *
 * The device service fires every move in its own transaction and writes
 * what the move carries along — the holder, the allocation ledger, the
 * timeline — in that same transaction. Repairs, disposals, stocktakes,
 * receiving and the assistant still go through the device service, never
 * the runtime: what a device's move carries along is the service's. Moves
 * only another domain makes (to repair and back, to pending disposal and
 * disposed) are `manual: false`. Who may make each is the grant's, as it
 * was, so there are no guards; a device tells nobody, so no effects.
 *
 * The names below are stored with every log entry: never rename the
 * lifecycle, a state or a transition casually.
 */

export const DEVICE_LIFECYCLE = 'devices';

export interface DeviceRecord extends LifecycleRecord {
  readonly status: DeviceStatus;
  readonly assigneeId?: unknown;
  readonly expectedReturnDate?: unknown;
}

export interface DeviceTypes {
  record: DeviceRecord;
  state: DeviceStatus;
}

type Context = TransitionContext<DeviceTypes>;

const isStatus = (value: unknown, among: readonly DeviceStatus[]) =>
  typeof value === 'string' && (among as readonly string[]).includes(value);

/** The state a move asks for (`nextStatus` / `status`), as the service passes it. */
const requested =
  (field: string, among: readonly DeviceStatus[], fallback: DeviceStatus) =>
  ({ input }: Context): DeviceStatus =>
    isStatus(input[field], among) ? (input[field] as DeviceStatus) : fallback;

const validateRequested =
  (field: string, among: readonly DeviceStatus[], message: string) =>
  (input: Record<string, unknown>) =>
    isStatus(input[field], among) ? null : [{ field, message }];

/** Every move is a write to the device. */
const touched = ({ now }: { readonly now: Date }) => ({ updatedAt: now });

/** A move from where `OPERATION_FROM` lets the operation start. */
const from = (operation: keyof typeof OPERATION_FROM) => [
  ...OPERATION_FROM[operation],
];

export const deviceLifecycle: Lifecycle<DeviceTypes> =
  defineLifecycle<DeviceTypes>({
    name: DEVICE_LIFECYCLE,
    // A device enters the register in stock; receiving an order is the
    // check, so there is no state before it (2026-09-26).
    initial: 'inStock',
    states: DEVICE_STATUSES.map((state) =>
      state === 'disposed' ? { name: state, final: true } : state,
    ),
    transitions: {
      assign: {
        title: 'Assign',
        from: from('assign'),
        to: 'inUse',
        set: touched,
      },
      loan: { title: 'Loan', from: from('loan'), to: 'onLoan', set: touched },
      // From one holder to the next: the state stays, the version moves.
      transfer: {
        title: 'Transfer',
        from: from('transfer'),
        to: 'inUse',
        set: touched,
      },
      return: {
        title: 'Return',
        from: from('return'),
        to: [...RETURN_TARGETS],
        route: requested('nextStatus', RETURN_TARGETS, 'inStock'),
        validate: (input) =>
          input.nextStatus === undefined
            ? null
            : validateRequested(
                'nextStatus',
                RETURN_TARGETS,
                'Invalid status after return',
              )(input),
        set: touched,
      },
      // Held for someone while it waits in stock: the state stays.
      reserve: {
        title: 'Reserve',
        from: from('reserve'),
        to: 'inStock',
        set: touched,
      },
      unreserve: {
        title: 'Cancel the reservation',
        from: from('unreserve'),
        to: 'inStock',
        set: touched,
      },
      markLost: {
        title: 'Mark lost',
        from: from('markLost'),
        to: 'lost',
        set: touched,
      },
      restore: {
        title: 'Restore',
        from: from('restore'),
        to: 'inStock',
        set: touched,
      },
      retire: {
        title: 'Retire',
        from: from('retire'),
        to: 'retired',
        set: touched,
      },
      reactivate: {
        title: 'Reactivate',
        from: from('reactivate'),
        to: 'inStock',
        set: touched,
      },
      // A repair filed, and finished: back to whoever still holds it, or to
      // stock.
      sendToRepair: {
        title: 'Send to repair',
        from: from('sendToRepair'),
        to: 'inRepair',
        manual: false,
        set: touched,
      },
      repairDone: {
        title: 'Back from repair',
        from: from('repairDone'),
        to: ['inUse', 'onLoan', 'inStock'],
        route: ({ record }) =>
          record.assigneeId
            ? record.expectedReturnDate
              ? 'onLoan'
              : 'inUse'
            : 'inStock',
        manual: false,
        set: touched,
      },
      // A disposal approved, and executed.
      markPendingDisposal: {
        title: 'Pending disposal',
        from: from('markPendingDisposal'),
        to: 'pendingDisposal',
        manual: false,
        set: touched,
      },
      dispose: {
        title: 'Dispose',
        from: from('dispose'),
        to: 'disposed',
        manual: false,
        set: touched,
      },
      // A person putting the record right, with a reason; never into or out
      // of disposed, which only a disposal reaches.
      correct: {
        title: 'Correct the status',
        from: { except: ['disposed'] },
        to: [...CORRECTABLE_STATUSES],
        route: requested('status', CORRECTABLE_STATUSES, 'inStock'),
        validate: (input) => [
          ...(validateRequested(
            'status',
            CORRECTABLE_STATUSES,
            'Invalid status',
          )(input) ?? []),
          ...(typeof input.reason === 'string' && input.reason.trim()
            ? []
            : [{ field: 'reason', message: 'A reason is required' }]),
        ],
        set: touched,
      },
    },
  });
