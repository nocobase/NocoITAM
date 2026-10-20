import type { ItamRecord } from './api.js';
import {
  AUDIT_FIELDS,
  OWNER_FIELD,
  type FieldDefinition,
  type FieldOption,
  whenStraightLine,
} from './fields.js';

/** The lender and the date to return to them only exist for leased and borrowed devices. */
const whenLent = (values: Readonly<Record<string, unknown>>): boolean =>
  values.ownership === 'leased' || values.ownership === 'borrowed';

/** Device metadata shared by the list, detail page and dialogs. */
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
export const RETURN_TARGETS = [
  'inStock',
  'inRepair',
  'pendingDisposal',
  'retired',
] as const;

/**
 * The statuses a device operation starts from, mirroring `OPERATION_FROM`
 * in the server's device state machine, so a page can hide an action the
 * server would refuse.
 */
export const OPERATION_FROM: Readonly<
  Record<
    | 'assign'
    | 'return'
    | 'transfer'
    | 'sendToRepair'
    | 'createRepair'
    | 'markPendingDisposal',
    readonly DeviceStatus[]
  >
> = {
  assign: ['inStock'],
  return: ['inUse', 'onLoan'],
  transfer: ['inUse'],
  sendToRepair: ['inUse', 'onLoan', 'inStock'],
  // A repair record may also be opened for a device already in repair when
  // none is open (put there by a status correction); it skips the transition.
  createRepair: ['inUse', 'onLoan', 'inStock', 'inRepair'],
  markPendingDisposal: [
    'inStock',
    'inUse',
    'onLoan',
    'inRepair',
    'retired',
    'lost',
  ],
};

/** Badge tone per status, mapped to semantic classes. */
export const STATUS_TONE: Readonly<Record<DeviceStatus, string>> = {
  inStock: 'bg-primary/10 text-primary',
  inUse: 'bg-primary text-primary-foreground',
  onLoan: 'bg-primary/20 text-primary',
  // In progress, not wrong (2026-10-20): amber as 审批中 is; red is kept
  // for what has gone wrong — pending disposal, lost.
  inRepair: 'bg-warning text-warning-foreground',
  retired: 'bg-muted text-muted-foreground',
  pendingDisposal: 'bg-destructive/10 text-destructive',
  disposed: 'bg-muted text-muted-foreground',
  lost: 'bg-destructive text-destructive-foreground',
};

const options = (group: string, values: readonly string[]): FieldOption[] =>
  values.map((value) => ({ value, label: `enums.${group}.${value}` }));

export const DEVICE_STATUS_OPTIONS: readonly FieldOption[] = options(
  'deviceStatus',
  DEVICE_STATUSES,
);
export const DEVICE_COST_FIELDS = [
  'purchasePrice',
  'bookValue',
  'depreciatedAmount',
] as const;

/** Purchase details are the order's once a device came in through one. */
const whenOrdered = (values: Readonly<Record<string, unknown>>): boolean =>
  Boolean(values.purchaseOrderId);

export const DEVICE_FIELDS: readonly FieldDefinition[] = [
  {
    key: 'deviceNo',
    // Title / summary strip, not a row of the information card.
    detail: false,
    label: 'fields.deviceNo',
    type: 'text',
    column: true,
    form: false,
    group: 'groups.basic',
  },
  {
    key: 'name',
    label: 'fields.name',
    type: 'text',
    column: true,
    group: 'groups.basic',
  },
  {
    key: 'serialNo',
    label: 'fields.serialNo',
    type: 'text',
    column: true,
    group: 'groups.basic',
  },
  {
    key: 'modelId',
    label: 'fields.model',
    type: 'reference',
    required: true,
    reference: { collection: 'models' },
    column: true,
    group: 'groups.basic',
  },
  {
    key: 'categoryId',
    // The detail reads 序列号、型号、分类、制造商; the list keeps its columns.
    // Shown in the create dialog as the model fills it, never typed.
    label: 'fields.category',
    type: 'reference',
    required: true,
    reference: { collection: 'categories' },
    column: true,
    readonlyWhen: () => true,
    readonlyHint: 'devices.followsModel',
    group: 'groups.basic',
  },
  {
    key: 'manufacturerId',
    label: 'fields.manufacturer',
    type: 'reference',
    required: true,
    reference: { collection: 'manufacturers' },
    readonlyWhen: () => true,
    readonlyHint: 'devices.followsModel',
    group: 'groups.basic',
  },
  {
    key: 'status',
    // Title / summary strip, not a row of the information card.
    detail: false,
    label: 'fields.status',
    type: 'select',
    options: DEVICE_STATUS_OPTIONS,
    column: true,
    form: false,
    group: 'groups.basic',
  },
  {
    key: 'notes',
    label: 'fields.notes',
    type: 'textarea',
    group: 'groups.basic',
  },

  {
    key: 'ownership',
    label: 'fields.ownership',
    type: 'select',
    required: true,
    defaultValue: 'owned',
    options: options('ownership', DEVICE_OWNERSHIPS),
    group: 'groups.ownership',
  },
  {
    key: 'lenderVendorId',
    label: 'fields.lender',
    type: 'reference',
    reference: { collection: 'vendors' },
    group: 'groups.ownership',
    visibleWhen: whenLent,
    requiredWhen: whenLent,
  },
  {
    key: 'returnDueDate',
    label: 'fields.returnDueDate',
    type: 'date',
    group: 'groups.ownership',
    visibleWhen: whenLent,
    requiredWhen: whenLent,
  },
  {
    key: 'departmentId',
    label: 'fields.owningDepartment',
    type: 'reference',
    reference: { collection: 'departments' },
    column: true,
    group: 'groups.ownership',
  },
  {
    key: 'locationId',
    label: 'fields.location',
    type: 'reference',
    required: true,
    reference: { collection: 'locations' },
    column: true,
    group: 'groups.ownership',
  },
  {
    key: 'assignedAt',
    // Title / summary strip, not a row of the information card.
    detail: false,
    label: 'fields.assignedAt',
    type: 'date',
    form: false,
    group: 'groups.ownership',
  },
  {
    key: 'expectedReturnDate',
    // Title / summary strip, not a row of the information card.
    detail: false,
    label: 'fields.expectedReturnDate',
    type: 'date',
    form: false,
    group: 'groups.ownership',
  },
  // Written by receiving only; first in its group, as the vendor, price
  // and date below follow it (2026-10-17).
  {
    key: 'purchaseOrderId',
    label: 'fields.purchaseOrder',
    type: 'reference',
    reference: { collection: 'purchaseOrders' },
    form: false,
    group: 'groups.purchase',
  },
  // A device received through an order takes vendor, price and date from
  // the order; they are edited only on devices registered by hand.
  {
    key: 'vendorId',
    label: 'fields.vendor',
    type: 'reference',
    reference: { collection: 'vendors' },
    readonlyWhen: whenOrdered,
    readonlyHint: 'devices.followsOrder',
    group: 'groups.purchase',
  },
  {
    key: 'purchasePrice',
    label: 'fields.purchasePrice',
    type: 'money',
    currencyField: 'currency',
    readonlyWhen: whenOrdered,
    readonlyHint: 'devices.followsOrder',
    group: 'groups.purchase',
  },
  {
    key: 'purchaseDate',
    label: 'fields.purchaseDate',
    type: 'date',
    readonlyWhen: whenOrdered,
    readonlyHint: 'devices.followsOrder',
    group: 'groups.purchase',
  },
  {
    // Shown with the price ("CNY 3,600.00"); set on creation from the
    // general settings, so it needs no row of its own.
    key: 'currency',
    label: 'fields.currency',
    type: 'currency',
    form: false,
    detail: false,
    group: 'groups.purchase',
  },
  {
    key: 'warrantyEndDate',
    label: 'fields.warrantyEndDate',
    type: 'date',
    group: 'groups.purchase',
  },
  // Purchase date plus the category's replacement cycle: a company rule,
  // not a per-device fact, so it is computed and never edited here.
  {
    key: 'plannedReplacementDate',
    label: 'fields.plannedReplacementDate',
    type: 'date',
    form: false,
    readonlyHint: 'devices.replacementRule',
    group: 'groups.purchase',
  },
  {
    key: 'depreciationMethod',
    label: 'fields.depreciationMethod',
    type: 'select',
    options: options('depreciationMethod', ['none', 'straightLine']),
    group: 'groups.purchase',
  },
  {
    key: 'usefulLifeMonths',
    label: 'fields.usefulLifeMonths',
    visibleWhen: whenStraightLine,
    type: 'number',
    min: 0,
    group: 'groups.purchase',
  },
  {
    key: 'residualRate',
    label: 'fields.residualRate',
    visibleWhen: whenStraightLine,
    type: 'percent',
    group: 'groups.purchase',
  },
  {
    key: 'bookValue',
    label: 'fields.bookValue',
    type: 'money',
    form: false,
    group: 'groups.purchase',
  },
  {
    key: 'depreciatedAmount',
    label: 'fields.depreciatedAmount',
    type: 'money',
    form: false,
    group: 'groups.purchase',
  },

  {
    key: 'lastAuditedAt',
    label: 'fields.lastAuditedAt',
    type: 'date',
    form: false,
    // Between 创建人 and 创建时间: 负责人 leads 系统 as on every record, and
    // the last count is a date beside the record's other dates.
    detailOrder: 1,
    group: 'groups.system',
  },
  OWNER_FIELD,
  ...AUDIT_FIELDS,
];

/** Fields the create dialog shows, in order. */
export const DEVICE_CREATE_FIELDS: readonly string[] = [
  'modelId',
  'categoryId',
  'manufacturerId',
  'serialNo',
  'name',
  'locationId',
  'departmentId',
  'ownership',
  'lenderVendorId',
  'returnDueDate',
  'vendorId',
  'purchasePrice',
  'purchaseDate',
  'warrantyEndDate',
  'notes',
  'ownerId',
];

export type WarrantyState = 'active' | 'expiring' | 'expired' | 'unknown';

export function warrantyState(
  warrantyEndDate: unknown,
  warrantyDays: number,
  today = new Date(),
): { state: WarrantyState; daysLeft?: number } {
  if (typeof warrantyEndDate !== 'string' || !warrantyEndDate)
    return { state: 'unknown' };
  const end = new Date(`${warrantyEndDate.slice(0, 10)}T00:00:00`);
  const daysLeft = Math.ceil((end.getTime() - today.getTime()) / 86_400_000);
  if (daysLeft < 0) return { state: 'expired', daysLeft };
  if (daysLeft <= warrantyDays) return { state: 'expiring', daysLeft };
  return { state: 'active', daysLeft };
}

/**
 * How a device's planned replacement date stands. A replacement needs a
 * purchase order raised and approved before the old device goes, so it is
 * flagged a quarter ahead (`REPLACEMENT_LEAD_DAYS`) rather than at the
 * warranty's threshold, which is about a different act.
 */
export const REPLACEMENT_LEAD_DAYS = 90;

export function replacementState(
  plannedReplacementDate: unknown,
  today = new Date(),
): { state: 'overdue' | 'soon' | 'later' | 'unknown'; days?: number } {
  if (typeof plannedReplacementDate !== 'string' || !plannedReplacementDate)
    return { state: 'unknown' };
  const due = new Date(`${plannedReplacementDate.slice(0, 10)}T00:00:00`);
  const daysLeft = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
  if (daysLeft < 0) return { state: 'overdue', days: -daysLeft };
  if (daysLeft <= REPLACEMENT_LEAD_DAYS)
    return { state: 'soon', days: daysLeft };
  return { state: 'later', days: daysLeft };
}

/** The label of a device's holder relation: 分配给 / 借给 / 预留给, or 分配对象. */
export function deviceRelationLabel(
  device: ItamRecord,
  t: (key: string) => string,
): string {
  if (device.assigneeId)
    return device.status === 'onLoan'
      ? t('devices.loanedTo')
      : t('devices.assignedTo');
  if (device.reservedForId) return t('devices.reservedFor');
  return t('fields.assignee');
}

/** The collection a device holder type points at; devices for another device. */
export const holderCollection = (type: unknown): string =>
  type === 'person' ? 'people' : type === 'location' ? 'locations' : 'devices';
