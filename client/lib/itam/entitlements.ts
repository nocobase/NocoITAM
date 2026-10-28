import {
  AUDIT_FIELDS,
  OWNER_FIELD,
  type FieldDefinition,
  type FieldOption,
} from './fields.js';

/**
 * Software entitlements (授权): one collection, two kinds. A perpetual
 * entitlement is bought once and has a licensing model, product key and
 * maintenance term; a subscription is paid per cycle and has billing,
 * renewal and business-owner fields. The kind decides which fields show.
 */
export const ENTITLEMENTS_PATH = 'itam/entitlements';

export const ENTITLEMENT_KINDS = ['perpetual', 'subscription'] as const;
export type EntitlementKind = (typeof ENTITLEMENT_KINDS)[number];

const options = (group: string, values: readonly string[]): FieldOption[] =>
  values.map((value) => ({ value, label: `enums.${group}.${value}` }));

export const LICENSING_MODELS = [
  'perUser',
  'perDevice',
  'site',
  'free',
] as const;
export const COMPLIANCE_STATUSES = [
  'compliant',
  'overAllocated',
  'idle',
] as const;
export const BILLING_MODELS = ['perSeat', 'flat'] as const;
export const BILLING_CYCLES = ['month', 'quarter', 'year'] as const;

const perpetual = (values: Readonly<Record<string, unknown>>): boolean =>
  values.kind === 'perpetual';
const subscription = (values: Readonly<Record<string, unknown>>): boolean =>
  values.kind === 'subscription';
/**
 * A seat count is required unless the entitlement is unlimited by nature
 * (a site or free licence of either kind); a flat-priced subscription may
 * state one as its cap.
 */
const seatsRequired = (values: Readonly<Record<string, unknown>>): boolean =>
  values.licensingModel !== 'site' &&
  values.licensingModel !== 'free' &&
  (values.kind === 'perpetual' || values.billingModel === 'perSeat');

export const ENTITLEMENT_FIELDS: readonly FieldDefinition[] = [
  {
    key: 'name',
    label: 'fields.name',
    type: 'text',
    required: true,
    column: true,
    group: 'groups.basic',
  },
  // Chosen once: the kind decides the rest of the form and never changes.
  {
    key: 'kind',
    label: 'fields.entitlementKind',
    type: 'select',
    required: true,
    options: options('entitlementKind', ENTITLEMENT_KINDS),
    defaultValue: 'perpetual',
    clearOnChange: ['billingModel', 'billingCycle'],
    readonlyWhen: (values) => values.id !== undefined,
    column: true,
    group: 'groups.basic',
    // 基本信息 reads 授权类型, 负责人, 软件产品, 制造商, 分类 (2026-10-22): the
    // kind first, above the owner (who leads at -1000).
    detailOrder: -2000,
  },
  {
    key: 'softwareProductId',
    label: 'fields.softwareProduct',
    type: 'reference',
    required: true,
    reference: { collection: 'softwareProducts' },
    column: true,
    group: 'groups.basic',
    detailOrder: -900,
  },
  // Category and manufacturer follow the software product, as a device's
  // follow its model: shown, filterable, never edited here.
  {
    key: 'categoryId',
    label: 'fields.category',
    type: 'reference',
    reference: {
      collection: 'categories',
      filter: { appliesTo: 'entitlement' },
    },
    column: true,
    readonlyWhen: () => true,
    readonlyHint: 'entitlements.followsProduct',
    group: 'groups.basic',
    detailOrder: -700,
  },
  {
    key: 'manufacturerId',
    label: 'fields.manufacturer',
    type: 'reference',
    reference: { collection: 'manufacturers' },
    column: true,
    readonlyWhen: () => true,
    readonlyHint: 'entitlements.followsProduct',
    group: 'groups.basic',
    detailOrder: -800,
  },
  // Both kinds (2026-10-28; perpetual ones alone before): it decides
  // whether seats are counted and whether people or devices hold them, so
  // it leads 数量.
  {
    key: 'licensingModel',
    label: 'fields.licensingModel',
    type: 'select',
    required: true,
    options: options('licensingModel', LICENSING_MODELS),
    group: 'groups.quantity',
  },
  {
    key: 'seatCount',
    label: 'fields.seatCount',
    type: 'number',
    min: 0,
    // Site and free licences leave it empty (unlimited); a flat-priced
    // subscription may state it as a cap or leave it empty.
    requiredWhen: seatsRequired,
    // Stated when the entitlement is created; afterwards it moves through
    // the seat operations, which record how many and why — a stock item's
    // quantity works the same way.
    readonlyWhen: (values) => values.id !== undefined,
    column: true,
    // In 数量 (2026-10-22; leading 基本信息 from 2026-10-16), as a
    // stock item's quantities are.
    group: 'groups.quantity',
  },
  {
    key: 'assignedCount',
    label: 'fields.assignedCount',
    type: 'number',
    form: false,
    column: true,
    group: 'groups.quantity',
  },
  {
    // Derived on the server: seats minus what is assigned. Unlimited seats
    // leave it empty.
    key: 'availableSeats',
    label: 'fields.availableSeats',
    type: 'number',
    form: false,
    group: 'groups.quantity',
  },
  {
    key: 'complianceStatus',
    label: 'fields.complianceStatus',
    type: 'select',
    options: options('complianceStatus', COMPLIANCE_STATUSES),
    column: true,
    form: false,
    // In 数量 after the counts it is worked out from (2026-10-22): more
    // assigned than owned is 超量, too many free 闲置.
    group: 'groups.quantity',
  },
  {
    key: 'reassignable',
    label: 'fields.reassignable',
    type: 'boolean',
    visibleWhen: perpetual,
    // With the seat counts (2026-10-22), not a group of its own.
    group: 'groups.quantity',
  },
  {
    key: 'billingModel',
    label: 'fields.billingModel',
    type: 'select',
    requiredWhen: subscription,
    visibleWhen: subscription,
    options: options('billingModel', BILLING_MODELS),
    group: 'groups.billing',
  },
  {
    key: 'billingCycle',
    label: 'fields.billingCycle',
    type: 'select',
    requiredWhen: subscription,
    visibleWhen: subscription,
    options: options('billingCycle', BILLING_CYCLES),
    group: 'groups.billing',
  },
  {
    key: 'unitPrice',
    label: 'fields.unitPrice',
    // The one price: per seat per cycle, or the whole cycle when flat.
    labelWhen: (values) =>
      values.billingModel === 'flat' ? 'fields.cyclePrice' : undefined,
    type: 'money',
    currencyField: 'currency',
    visibleWhen: subscription,
    group: 'groups.billing',
  },
  {
    key: 'annualCost',
    label: 'fields.annualCost',
    type: 'money',
    form: false,
    // Computed, so the label says from what.
    readonlyHint: 'entitlements.annualCostHint',
    visibleWhen: subscription,
    group: 'groups.billing',
  },
  {
    key: 'startDate',
    label: 'fields.startDate',
    // When a perpetual licence was bought; a subscription is dated by its
    // next renewal alone.
    visibleWhen: perpetual,
    type: 'date',
    group: 'groups.lifecycle',
  },
  {
    key: 'expiryDate',
    label: 'fields.expiryDate',
    // The date the subscription renews on, or ends on when it does not
    // renew; rolled forward a cycle each time it passes while it renews.
    labelWhen: (values) =>
      values.autoRenew === false
        ? 'fields.subscriptionEnd'
        : 'fields.nextRenewalDate',
    type: 'date',
    // A perpetual entitlement never expires; its maintenance may.
    requiredWhen: subscription,
    visibleWhen: subscription,
    column: true,
    group: 'groups.lifecycle',
  },
  {
    key: 'maintenanceExpiryDate',
    label: 'fields.maintenanceExpiryDate',
    type: 'date',
    visibleWhen: perpetual,
    group: 'groups.lifecycle',
  },
  {
    key: 'autoRenew',
    label: 'fields.autoRenew',
    type: 'boolean',
    // On: the renewal date moves on by itself. Off: that date is the end.
    defaultValue: true,
    visibleWhen: subscription,
    group: 'groups.lifecycle',
  },
  {
    key: 'currency',
    label: 'fields.currency',
    type: 'currency',
    visibleWhen: subscription,
    group: 'groups.billing',
  },
  // Masked in reads and replaced rather than edited: the inline editor opens
  // empty, and leaving it empty keeps the stored key.
  {
    key: 'productKey',
    label: 'fields.productKey',
    type: 'text',
    writeOnly: true,
    // Both kinds (2026-10-23): some subscriptions activate by key, such as
    // a security suite's yearly licence key.
    group: 'groups.basic',
  },
  {
    key: 'consoleUrl',
    label: 'fields.consoleUrl',
    type: 'url',
    // Both kinds: a perpetual licence has a vendor portal too (keys,
    // downloads, maintenance).
    group: 'groups.basic',
  },
  {
    key: 'notes',
    label: 'fields.notes',
    type: 'textarea',
    group: 'groups.basic',
  },
  OWNER_FIELD,
  ...AUDIT_FIELDS,
];

/** The create dialog: the kind first, then what that kind needs. */
export const ENTITLEMENT_CREATE_FIELDS: readonly string[] = [
  'kind',
  // The product, then the name it gives; category and maker follow it and
  // are read on the record, not asked for here (2026-10-23).
  'softwareProductId',
  'name',
  'licensingModel',
  'billingModel',
  'billingCycle',
  'seatCount',
  'unitPrice',
  'startDate',
  'expiryDate',
  'maintenanceExpiryDate',
  'autoRenew',
  'productKey',
  'reassignable',
  'consoleUrl',
  // 负责人 above 备注, the long text closing the dialog (2026-10-23).
  'ownerId',
  'notes',
];

export interface EntitlementStats {
  readonly total: number;
  readonly perpetual: number;
  readonly subscription: number;
  readonly overAllocated: number;
  readonly overAllocatedSeats: number;
  readonly idle: number;
  readonly idleSeats: number;
  readonly expiring: number;
  readonly spendThisYear: number | null;
  readonly annualSpend: number | null;
}
