/**
 * The single-device state machine from the specification. Status changes only
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
