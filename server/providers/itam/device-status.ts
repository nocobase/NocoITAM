/**
 * The single-device state machine. Status changes only
 * happen through the operations below; a manual correction is its own
 * operation that records a reason.
 */
export const DEVICE_STATUSES = [
  'inStock',
  'inUse',
  'onLoan',
  'inRepair',
  'retired',
  'pendingDisposal',
  'disposed',
  'lost',
] as const;

export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

export const DEVICE_OWNERSHIPS = [
  'owned',
  'leased',
  'borrowed',
  'byod',
] as const;
export const ASSIGNEE_TYPES = ['person', 'location', 'device'] as const;
export type AssigneeType = (typeof ASSIGNEE_TYPES)[number];

/** A device is reserved for whoever it will be assigned to: the same targets. */
export const RESERVATION_TYPES: typeof ASSIGNEE_TYPES = ASSIGNEE_TYPES;
export type ReservationType = (typeof RESERVATION_TYPES)[number];

/**
 * The statuses a correction may set, which is every one a person can get back
 * out of.
 *
 * `disposed` is left out because it is final: no operation starts from it, and
 * it is what executing a disposal produces — a decision with an approval
 * behind it, not a correction. `pendingDisposal` is left out because it is
 * what a disposal request produces, and setting it directly would put a device
 * on its way out with nobody having asked. The rest are reversible:
 * `reactivate` undoes `retired`, `restore` undoes `lost`, and the operations
 * move the others between themselves.
 *
 * It is what the assistant may propose (`server/providers/itam/ai-writes.ts`):
 * a terminal state is a person's own act on the record's page, taken there
 * with everything the page shows. A person correcting a status by hand is not
 * narrowed by this.
 */
export const CORRECTABLE_STATUSES: readonly DeviceStatus[] = [
  'inStock',
  'inUse',
  'onLoan',
  'inRepair',
  'retired',
  'lost',
];

/** Statuses counted as "in use" for utilisation. */
export const IN_USE_STATUSES: readonly DeviceStatus[] = ['inUse', 'onLoan'];

/** The state each operation may start from. */
export const OPERATION_FROM: Readonly<
  Record<DeviceOperation, readonly DeviceStatus[]>
> = {
  assign: ['inStock'],
  loan: ['inStock'],
  return: ['inUse', 'onLoan'],
  transfer: ['inUse'],
  reserve: ['inStock'],
  unreserve: ['inStock'],
  sendToRepair: ['inUse', 'onLoan', 'inStock'],
  repairDone: ['inRepair'],
  markPendingDisposal: [
    'inStock',
    'inUse',
    'onLoan',
    'inRepair',
    'retired',
    'lost',
  ],
  dispose: ['pendingDisposal'],
  markLost: ['inUse', 'onLoan', 'inStock', 'retired'],
  restore: ['lost'],
  retire: ['inStock'],
  reactivate: ['retired'],
};

export type DeviceOperation =
  | 'assign'
  | 'loan'
  | 'return'
  | 'transfer'
  | 'reserve'
  | 'unreserve'
  | 'sendToRepair'
  | 'repairDone'
  | 'markPendingDisposal'
  | 'dispose'
  | 'markLost'
  | 'restore'
  | 'retire'
  | 'reactivate';

/** The states a returned device may go to. */
export const RETURN_TARGETS: readonly DeviceStatus[] = [
  'inStock',
  'inRepair',
  'pendingDisposal',
  'retired',
];

export function isDeviceStatus(value: unknown): value is DeviceStatus {
  return (
    typeof value === 'string' &&
    (DEVICE_STATUSES as readonly string[]).includes(value)
  );
}
