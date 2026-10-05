import {
  AUDIT_FIELDS,
  type FieldDefinition,
  type FieldOption,
} from './fields.js';

export const PURCHASE_ORDERS_PATH = 'itam/purchase-orders';
const options = (group: string, values: readonly string[]): FieldOption[] =>
  values.map((value) => ({ value, label: `enums.${group}.${value}` }));

export const PO_REASONS = [
  'newHire',
  'batchReplacement',
  'stockReplenishment',
  'project',
  'faultReplacement',
  'other',
] as const;
export const PO_STATUSES = [
  'draft',
  'pendingApproval',
  'approved',
  'rejected',
  'ordered',
  'partiallyReceived',
  'completed',
  'cancelled',
] as const;
/**
 * Badge tone per status, the way a device's statuses read: what is waiting
 * on someone is amber, what is moving is primary, a refusal or a call-off
 * is destructive, and what is finished or never started is muted.
 */
export const PO_STATUS_TONE: Readonly<Record<string, string>> = {
  draft: 'bg-muted text-muted-foreground',
  pendingApproval: 'bg-warning text-warning-foreground',
  approved: 'bg-primary/10 text-primary',
  rejected: 'bg-destructive/10 text-destructive',
  ordered: 'bg-primary/20 text-primary',
  partiallyReceived: 'bg-info text-info-foreground',
  completed: 'bg-primary text-primary-foreground',
  cancelled: 'bg-muted text-muted-foreground',
};

/**
 * The same statuses as a dot, for a board column's heading: the strong side
 * of each tag above, and the primary ones told apart by depth as their tags
 * are. Keep the two in step.
 */
export const PO_STATUS_DOT: Readonly<Record<string, string>> = {
  draft: 'bg-muted-foreground',
  pendingApproval: 'bg-warning-foreground',
  approved: 'bg-primary/40',
  rejected: 'bg-destructive',
  ordered: 'bg-primary/70',
  partiallyReceived: 'bg-info-foreground',
  completed: 'bg-primary',
  cancelled: 'bg-muted-foreground/50',
};

export const LINE_ITEM_TYPES = [
  'device',
  'accessory',
  'consumable',
  'component',
  'perpetual',
  'subscription',
] as const;
export type LineItemType = (typeof LINE_ITEM_TYPES)[number];

/**
 * Statuses in which the request itself is settled: the approval was given
 * for what the order said then, so what it asks for stops changing. What
 * still moves is the delivery — `expectedAt` by hand, `orderedAt` and
 * `receivedAt` through 标记已下单 and 到货入库 — and the lines, which state
 * a reason when they change. Mirrors `SETTLED_STATUSES` in
 * `server/providers/itam/procurement.ts`.
 */
const SETTLED = new Set(['approved', 'ordered', 'partiallyReceived']);
const settled = (values: Readonly<Record<string, unknown>>) =>
  SETTLED.has(typeof values.status === 'string' ? values.status : '');

/**
 * The order date and what the vendor promised are answers 标记已下单 gives,
 * both at once, so neither reads before it: an approved order that has not
 * been placed shows no delivery dates rather than two empty ones.
 */
const placed = (values: Readonly<Record<string, unknown>>) =>
  Boolean(values.orderedAt);

/** 到货入库 answers this one; before it there is nothing to read. */
const received = (values: Readonly<Record<string, unknown>>) =>
  Boolean(values.receivedAt);

export const PO_FIELDS: readonly FieldDefinition[] = [
  {
    key: 'orderNo',
    label: 'fields.orderNo',
    type: 'text',
    column: true,
    form: false,
    group: 'groups.basic',
  },
  {
    key: 'reason',
    detailOrder: -10,
    label: 'fields.poReason',
    type: 'select',
    required: true,
    options: options('poReason', PO_REASONS),
    column: true,
    group: 'groups.basic',
    readonlyWhen: settled,
  },
  {
    key: 'status',
    detail: false,
    label: 'fields.status',
    type: 'select',
    options: options('poStatus', PO_STATUSES),
    column: true,
    form: false,
    group: 'groups.basic',
  },
  {
    key: 'description',
    detailOrder: 10,
    label: 'fields.description',
    type: 'textarea',
    group: 'groups.basic',
    readonlyWhen: settled,
  },
  {
    key: 'departmentId',
    // With what the order is for, after 事由 and 说明 (2026-10-05): the
    // 申请信息 group went once 负责人 moved to the summary strip.
    detailOrder: 20,
    label: 'fields.department',
    type: 'reference',
    reference: { collection: 'departments' },
    group: 'groups.basic',
    readonlyWhen: settled,
  },
  {
    key: 'neededBy',
    detailOrder: 21,
    label: 'fields.neededBy',
    type: 'date',
    column: true,
    group: 'groups.basic',
    readonlyWhen: settled,
  },
  {
    key: 'vendorId',
    detailOrder: -10,
    label: 'fields.vendor',
    type: 'reference',
    reference: { collection: 'vendors' },
    required: true,
    column: true,
    group: 'groups.purchase',
    readonlyWhen: settled,
  },
  {
    key: 'estimatedTotal',
    detail: false,
    label: 'fields.estimatedTotal',
    type: 'money',
    column: true,
    form: false,
    group: 'groups.purchase',
  },
  {
    key: 'currency',
    detailOrder: -9,
    label: 'fields.currency',
    type: 'currency',
    group: 'groups.purchase',
    readonlyWhen: settled,
  },
  {
    key: 'expectedAt',
    detailOrder: -6,
    label: 'fields.expectedAt',
    type: 'date',
    visibleWhen: placed,
    group: 'groups.purchase',
  },
  {
    // The day it was placed reads above what the vendor then promised.
    key: 'orderedAt',
    detailOrder: -7,
    label: 'fields.orderedAt',
    type: 'date',
    form: false,
    visibleWhen: placed,
    group: 'groups.purchase',
  },
  {
    key: 'receivedAt',
    detailOrder: -5,
    label: 'fields.receivedAt',
    type: 'date',
    form: false,
    visibleWhen: received,
    group: 'groups.purchase',
  },
  {
    key: 'ownerId',
    label: 'fields.owner',
    type: 'reference',
    // The person in IT who follows the order through; who it is for is its
    // department and its description, since employees do not sign in
    // (2026-10-05). Asked for on creation (starting at the filer), and
    // anybody's to hand over while the order is open — approved and waiting
    // included — so a request is handed over instead of cancelled and asked
    // again, and one whose 负责人 has left is not stuck (`handover` on the
    // domain).
    reference: { collection: 'users' },
    required: true,
    // Shown and handed over in the summary strip, not the information card.
    group: 'groups.basic',
    detailOrder: -10,
  },
  ...AUDIT_FIELDS,
];
// A request states when it is needed; when the goods are expected is the
// vendor's answer, so 标记已下单 fills it, not the person writing the request.
/**
 * Whether the order is this reader's: its 负责人, or whoever wrote it before
 * handing it over. Asking for approval, taking the request back and editing
 * it are all theirs — the service refuses everyone else with `NOT_OWNER`.
 */
export function raisedBy(
  record: Readonly<Record<string, unknown>>,
  currentUserId: string | undefined,
): boolean {
  if (currentUserId === undefined) return false;
  return (
    record.ownerId === currentUserId || record.createdById === currentUserId
  );
}

export const PO_CREATE_FIELDS: readonly string[] = [
  'reason',
  'description',
  // Who follows it through, and the department it is for. Left empty, the
  // service files the order under whoever is signed in.
  'ownerId',
  'departmentId',
  'neededBy',
  'vendorId',
];
