/**
 * The ITAM collections as authorization sees them: their actions, their
 * fields, and which fields are cost fields (hidden from roles without the
 * `viewCost` grant). This is runtime metadata for authorization registration
 * and for shaping API responses. Migrations never import it.
 */

export interface ItamCollectionDefinition {
  readonly name: string;
  readonly title: string;
  readonly actions: readonly string[];
  readonly fields: readonly string[];
  /** Fields only readable by roles whose read grant lists them. */
  readonly costFields?: readonly string[];
  /** Sensitive fields whose reads are audited. */
  readonly sensitiveFields?: readonly string[];
  readonly attributes?: Readonly<Record<string, string>>;
  /** Fields a full-text search matches against. */
  readonly searchFields: readonly string[];
  /** Field used as the default sort. */
  readonly defaultSort: string;
  /**
   * Sort keys that order by the name of a referenced record, e.g.
   * `manufacturerName` → the manufacturer's name via `manufacturerId`.
   */
  readonly sortByReference?: Readonly<
    Record<string, { readonly collection: string; readonly field: string }>
  >;
}

const audit = ['createdById', 'createdAt', 'updatedAt'] as const;
const crud = ['read', 'create', 'update', 'delete'] as const;

export const MASTER_DATA_COLLECTIONS: readonly ItamCollectionDefinition[] = [
  {
    name: 'manufacturers',
    title: 'Manufacturers',
    actions: crud,
    fields: [
      'id',
      'name',
      'website',
      'supportPhone',
      'supportEmail',
      'supportUrl',
      'notes',
      ...audit,
    ],
    attributes: { identifier: 'id', creator: 'createdById' },
    searchFields: ['name'],
    defaultSort: 'name',
  },
  {
    name: 'vendors',
    title: 'Vendors',
    actions: crud,
    fields: [
      'id',
      'name',
      'types',
      'contactName',
      'phone',
      'email',
      'address',
      'website',
      'notes',
      ...audit,
    ],
    attributes: { identifier: 'id', creator: 'createdById' },
    searchFields: ['name', 'contactName', 'email'],
    defaultSort: 'name',
  },
  {
    name: 'categories',
    title: 'Categories',
    actions: crud,
    fields: [
      'id',
      'name',
      'parentId',
      'appliesTo',
      'requiresSerial',
      'assignableToPerson',
      'depreciationMethod',
      'usefulLifeMonths',
      'residualRate',
      'warrantyMonths',
      'replacementMonths',
      'auditCycleDays',
      'fieldTemplate',
      'sort',
      ...audit,
    ],
    attributes: { identifier: 'id', creator: 'createdById' },
    searchFields: ['name'],
    defaultSort: 'sort',
  },
  {
    name: 'models',
    title: 'Models',
    actions: crud,
    fields: [
      'id',
      'name',
      'categoryId',
      'manufacturerId',
      'code',
      'specification',
      'imageFileId',
      'imageCredit',
      'warrantyMonths',
      'releaseDate',
      'eolDate',
      'eosDate',
      ...audit,
    ],
    attributes: { identifier: 'id', creator: 'createdById' },
    searchFields: ['name', 'code'],
    defaultSort: 'manufacturerName',
    sortByReference: {
      manufacturerName: {
        collection: 'manufacturers',
        field: 'manufacturerId',
      },
    },
  },
  {
    name: 'softwareProducts',
    title: 'Software products',
    actions: crud,
    fields: [
      'id',
      'name',
      'manufacturerId',
      'categoryId',
      'deliveryMethod',
      'description',
      'website',
      'notes',
      ...audit,
    ],
    attributes: { identifier: 'id', creator: 'createdById' },
    searchFields: ['name'],
    defaultSort: 'name',
  },
  {
    name: 'locations',
    title: 'Locations',
    actions: crud,
    fields: [
      'id',
      'name',
      'parentId',
      'type',
      'path',
      'address',
      'ownerId',
      'notes',
      'sort',
      ...audit,
    ],
    attributes: { identifier: 'id', owner: 'ownerId', creator: 'createdById' },
    searchFields: ['name', 'address'],
    defaultSort: 'sort',
  },
  {
    name: 'departments',
    title: 'Departments',
    actions: crud,
    fields: [
      'id',
      'name',
      'parentId',
      'code',
      'path',
      'costCenter',
      'managerId',
      'sort',
      ...audit,
    ],
    attributes: { identifier: 'id', creator: 'createdById' },
    searchFields: ['name', 'code'],
    defaultSort: 'sort',
  },
  {
    name: 'people',
    title: 'People',
    actions: [...crud, 'markLeft'],
    fields: [
      'id',
      'name',
      'employeeNo',
      'email',
      'phone',
      'departmentId',
      'position',
      'locationId',
      'userId',
      'employmentStatus',
      'hireDate',
      'leaveDate',
      'notes',
      ...audit,
    ],
    attributes: { identifier: 'id', creator: 'createdById' },
    searchFields: ['name', 'employeeNo', 'email'],
    defaultSort: 'name',
  },
];

export const DEVICE_COST_FIELDS: readonly string[] = [
  'purchasePrice',
  'bookValue',
  'depreciatedAmount',
];

export const DEVICES_COLLECTION: ItamCollectionDefinition = {
  name: 'devices',
  title: 'Devices',
  actions: [
    'read',
    'create',
    'update',
    'delete',
    'assign',
    'return',
    'transfer',
    'loan',
    'reserve',
    'correctStatus',
    'export',
  ],
  fields: [
    'id',
    'deviceNo',
    'serialNo',
    'name',
    'modelId',
    'categoryId',
    'manufacturerId',
    'status',
    'ownership',
    'lenderVendorId',
    'returnDueDate',
    'assigneeType',
    'assigneeId',
    'assignedAt',
    'expectedReturnDate',
    'reservedForType',
    'reservedForId',
    'reservedUntil',
    'departmentId',
    'locationId',
    'vendorId',
    'purchaseOrderId',
    'purchaseDate',
    'purchasePrice',
    'currency',
    'warrantyEndDate',
    'plannedReplacementDate',
    'depreciationMethod',
    'usefulLifeMonths',
    'residualRate',
    'bookValue',
    'depreciatedAmount',
    'notes',
    'attributes',
    'lastAuditedAt',
    'ownerId',
    ...audit,
  ],
  costFields: DEVICE_COST_FIELDS,
  attributes: { identifier: 'id', owner: 'ownerId', creator: 'createdById' },
  searchFields: ['deviceNo', 'serialNo', 'name'],
  defaultSort: 'deviceNo',
};

/** Prices live on the purchase receipts, gated with the order's cost fields. */
export const STOCK_COST_FIELDS: readonly string[] = [];

export const STOCK_ITEMS_COLLECTION: ItamCollectionDefinition = {
  name: 'stockItems',
  title: 'Stock items',
  actions: ['read', 'create', 'update', 'delete', 'issue', 'stockIn', 'export'],
  fields: [
    'id',
    'kind',
    'name',
    'categoryId',
    'modelId',
    'manufacturerId',
    'locationId',
    'totalQuantity',
    'usedQuantity',
    'minimumQuantity',
    'notes',
    // The category's extended fields, the way a device carries them.
    'attributes',
    'ownerId',
    ...audit,
  ],
  costFields: STOCK_COST_FIELDS,
  attributes: { identifier: 'id', owner: 'ownerId', creator: 'createdById' },
  searchFields: ['name'],
  defaultSort: 'name',
};

export const ENTITLEMENT_COST_FIELDS: readonly string[] = [
  'unitPrice',
  'annualCost',
];
export const ENTITLEMENT_SENSITIVE_FIELDS: readonly string[] = ['productKey'];

/**
 * Software entitlements of both kinds in one collection: the perpetual
 * columns (licensing model, product key, maintenance, purchase price) and
 * the subscription columns (billing, renewal, business owner, data region)
 * sit side by side and the kind decides which apply.
 */
export const ENTITLEMENTS_COLLECTION: ItamCollectionDefinition = {
  name: 'entitlements',
  title: 'Entitlements',
  actions: [
    'read',
    'create',
    'update',
    'delete',
    'assignSeat',
    'viewKey',
    'export',
  ],
  fields: [
    'id',
    'kind',
    'softwareProductId',
    'categoryId',
    'manufacturerId',
    'name',
    'licensingModel',
    'seatCount',
    'assignedCount',
    'complianceStatus',
    'productKey',
    'reassignable',
    'startDate',
    'expiryDate',
    'maintenanceExpiryDate',
    'currency',
    'billingModel',
    'billingCycle',
    'unitPrice',
    'annualCost',
    'autoRenew',
    'consoleUrl',
    'notes',
    // The category's extended fields, the way a device carries them.
    'attributes',
    'ownerId',
    ...audit,
  ],
  costFields: ENTITLEMENT_COST_FIELDS,
  sensitiveFields: ENTITLEMENT_SENSITIVE_FIELDS,
  attributes: { identifier: 'id', owner: 'ownerId', creator: 'createdById' },
  searchFields: ['name'],
  defaultSort: 'name',
};

export const PURCHASE_ORDER_COST_FIELDS: readonly string[] = ['estimatedTotal'];

export const PURCHASE_ORDERS_COLLECTION: ItamCollectionDefinition = {
  name: 'purchaseOrders',
  title: 'Purchase orders',
  actions: [
    'read',
    'create',
    'update',
    'delete',
    'submit',
    'approve',
    'order',
    'receive',
    'export',
  ],
  fields: [
    'id',
    'orderNo',
    'reason',
    'description',
    'ownerId',
    'departmentId',
    'neededBy',
    'vendorId',
    'estimatedTotal',
    'currency',
    'status',
    'orderedAt',
    'expectedAt',
    'receivedAt',
    'cancelReason',
    ...audit,
  ],
  costFields: PURCHASE_ORDER_COST_FIELDS,
  // An order belongs to its 负责人, the person in IT who follows it through
  // (the requester's field, renamed 2026-10-05).
  attributes: {
    identifier: 'id',
    owner: 'ownerId',
    creator: 'createdById',
  },
  searchFields: ['orderNo', 'description'],
  defaultSort: 'createdAt',
};

export const APPROVALS_COLLECTION: ItamCollectionDefinition = {
  name: 'approvals',
  title: 'Approvals',
  actions: ['read', 'decide'],
  fields: [
    'id',
    'subjectType',
    'subjectId',
    'title',
    'amount',
    'status',
    'requestedById',
    'requestedAt',
    'approverIds',
    'decidedById',
    'decidedAt',
    'comment',
  ],
  attributes: { identifier: 'id', creator: 'requestedById' },
  searchFields: ['title'],
  defaultSort: 'requestedAt',
};

export const ATTACHMENTS_COLLECTION: ItamCollectionDefinition = {
  name: 'attachmentLinks',
  title: 'Attachments',
  actions: ['read', 'create', 'delete'],
  fields: ['id', 'fileId', 'ownerType', 'ownerId', 'uploadedById', 'createdAt'],
  attributes: { identifier: 'id', creator: 'uploadedById' },
  searchFields: [],
  defaultSort: 'createdAt',
};

export const REPAIR_COST_FIELDS: readonly string[] = ['cost'];

export const REPAIRS_COLLECTION: ItamCollectionDefinition = {
  name: 'repairs',
  title: 'Repairs',
  actions: ['read', 'create', 'update', 'delete', 'complete'],
  fields: [
    'id',
    'repairNo',
    'deviceId',
    'method',
    'vendorId',
    'faultDescription',
    'sentAt',
    'expectedReturnAt',
    'actualReturnAt',
    'result',
    'cost',
    'currency',
    'notes',
    'ownerId',
    ...audit,
  ],
  costFields: REPAIR_COST_FIELDS,
  attributes: { identifier: 'id', creator: 'createdById' },
  searchFields: ['repairNo', 'faultDescription'],
  defaultSort: 'sentAt',
};

export const AUDIT_TASKS_COLLECTION: ItamCollectionDefinition = {
  name: 'auditTasks',
  title: 'Audit tasks',
  actions: [
    'read',
    'create',
    'update',
    'delete',
    'start',
    'count',
    'finish',
    'resolve',
    'cancel',
    'export',
  ],
  fields: [
    'id',
    'name',
    'scope',
    'plannedStart',
    'plannedEnd',
    'executorIds',
    'status',
    'expectedCount',
    'countedCount',
    'differenceCount',
    'notes',
    'cancelReason',
    'startedAt',
    'completedAt',
    ...audit,
  ],
  // No owner of its own: whoever created the task organised it.
  attributes: {
    identifier: 'id',
    owner: 'createdById',
    creator: 'createdById',
  },
  searchFields: ['name'],
  defaultSort: 'plannedStart',
};

export const DISPOSAL_COST_FIELDS: readonly string[] = [
  'bookValueTotal',
  'proceeds',
  'expenses',
];

export const DISPOSALS_COLLECTION: ItamCollectionDefinition = {
  name: 'disposals',
  title: 'Disposals',
  actions: [
    'read',
    'create',
    'update',
    'delete',
    'submit',
    'approve',
    'execute',
    'export',
  ],
  fields: [
    'id',
    'disposalNo',
    'method',
    'reason',
    'description',
    'ownerId',
    'requestedAt',
    'status',
    'deviceCount',
    'bookValueTotal',
    'disposedAt',
    'proceeds',
    'expenses',
    'currency',
    'recipientVendorId',
    'recipientName',
    'dataWipe',
    'wipeMethod',
    'executedById',
    ...audit,
  ],
  costFields: DISPOSAL_COST_FIELDS,
  // Its 负责人 (a user) is who a disposal belongs to for row-level rules.
  attributes: {
    identifier: 'id',
    owner: 'ownerId',
    creator: 'createdById',
  },
  searchFields: ['disposalNo', 'description'],
  defaultSort: 'createdAt',
};

export const SYSTEM_COLLECTIONS: readonly ItamCollectionDefinition[] = [
  {
    name: 'purchaseOrderLines',
    title: 'Purchase order lines',
    actions: ['read'],
    fields: [
      'id',
      'purchaseOrderId',
      'itemType',
      'modelId',
      'softwareProductId',
      'quantity',
      'unitPrice',
      'receivedQuantity',
      'sort',
      'createdAt',
      'updatedAt',
    ],
    costFields: ['unitPrice'],
    attributes: { identifier: 'id' },
    // Nothing free-text left to search on: a line is its model or product.
    searchFields: [],
    defaultSort: 'sort',
  },
  {
    name: 'purchaseReceipts',
    title: 'Purchase receipts',
    actions: ['read'],
    fields: [
      'id',
      'purchaseOrderId',
      'lineId',
      'quantity',
      'generatedType',
      'generatedId',
      'notes',
      'actorId',
      'createdAt',
    ],
    attributes: { identifier: 'id' },
    searchFields: [],
    defaultSort: 'createdAt',
  },
  {
    name: 'stockHoldings',
    title: 'Stock holdings',
    actions: ['read'],
    fields: [
      'id',
      'stockItemId',
      'holderType',
      'holderId',
      'quantity',
      'createdAt',
      'updatedAt',
    ],
    attributes: { identifier: 'id' },
    searchFields: [],
    defaultSort: 'createdAt',
  },
  {
    name: 'stockMovements',
    title: 'Stock movements',
    actions: ['read'],
    fields: [
      'id',
      'stockItemId',
      'type',
      'quantity',
      'holderType',
      'holderId',
      'sourceType',
      'sourceId',
      'notes',
      'actorId',
      'createdAt',
    ],
    attributes: { identifier: 'id' },
    searchFields: [],
    defaultSort: 'createdAt',
  },
  {
    name: 'entitlementSeats',
    title: 'Entitlement seats',
    actions: ['read'],
    fields: [
      'id',
      'entitlementId',
      'holderType',
      'holderId',
      'account',
      'assignedAt',
      'releasedAt',
      'actorId',
    ],
    attributes: { identifier: 'id' },
    searchFields: ['account'],
    defaultSort: 'assignedAt',
  },
  {
    name: 'auditItems',
    title: 'Audit items',
    actions: ['read'],
    fields: [
      'id',
      'auditTaskId',
      'deviceId',
      'label',
      'bookLocationId',
      'bookAssigneeType',
      'bookAssigneeId',
      'bookStatus',
      'result',
      'actualLocationId',
      'actualAssigneeId',
      'actualStatus',
      'notes',
      'resolution',
      'resolvedAt',
      'countedById',
      'countedAt',
      'createdAt',
      'updatedAt',
    ],
    attributes: { identifier: 'id' },
    searchFields: ['label'],
    defaultSort: 'createdAt',
  },
  {
    name: 'disposalDevices',
    title: 'Disposal devices',
    actions: ['read'],
    fields: [
      'id',
      'disposalId',
      'deviceId',
      'bookValue',
      'statusBefore',
      'createdAt',
    ],
    costFields: ['bookValue'],
    attributes: { identifier: 'id' },
    searchFields: [],
    defaultSort: 'createdAt',
  },
  {
    name: 'historyEvents',
    title: 'History',
    actions: ['read'],
    fields: [
      'id',
      'subjectType',
      'subjectId',
      'type',
      'summary',
      'payload',
      'sourceType',
      'sourceId',
      'actorId',
      'createdAt',
    ],
    attributes: { identifier: 'id' },
    searchFields: ['summary'],
    defaultSort: 'createdAt',
  },
  {
    name: 'changeLogs',
    title: 'Change logs',
    actions: ['read'],
    fields: [
      'id',
      'subjectType',
      'subjectId',
      'action',
      'field',
      'oldValue',
      'newValue',
      'sourceType',
      'sourceId',
      'actorId',
      'createdAt',
    ],
    attributes: { identifier: 'id' },
    searchFields: [],
    defaultSort: 'createdAt',
  },
  {
    name: 'allocations',
    title: 'Allocations',
    actions: ['read'],
    fields: [
      'id',
      'subjectType',
      'subjectId',
      'action',
      'targetType',
      'targetId',
      'previousTargetType',
      'previousTargetId',
      'quantity',
      'expectedReturnDate',
      'notes',
      'sourceType',
      'sourceId',
      'actorId',
      'createdAt',
      'endedAt',
    ],
    attributes: { identifier: 'id' },
    searchFields: [],
    defaultSort: 'createdAt',
  },
  {
    name: 'reminders',
    title: 'Reminders',
    actions: ['read', 'update'],
    fields: [
      'id',
      'kind',
      'subjectType',
      'subjectId',
      'severity',
      'data',
      'computedAt',
      'resolvedAt',
    ],
    attributes: { identifier: 'id' },
    searchFields: [],
    defaultSort: 'computedAt',
  },
];

export const ITAM_COLLECTIONS: readonly ItamCollectionDefinition[] = [
  ...MASTER_DATA_COLLECTIONS,
  DEVICES_COLLECTION,
  STOCK_ITEMS_COLLECTION,
  ENTITLEMENTS_COLLECTION,
  PURCHASE_ORDERS_COLLECTION,
  APPROVALS_COLLECTION,
  ATTACHMENTS_COLLECTION,
  REPAIRS_COLLECTION,
  AUDIT_TASKS_COLLECTION,
  DISPOSALS_COLLECTION,
  ...SYSTEM_COLLECTIONS,
];

export function findItamCollection(
  name: string,
): ItamCollectionDefinition | undefined {
  return ITAM_COLLECTIONS.find((collection) => collection.name === name);
}

/**
 * Settings and configuration are one settings item with two actions,
 * registered by the provider (`authz.settings.add`). It was a resource type
 * of its own (`itam.settings` / `general`) until authorization
 * 0.2.0-beta.21 made administration surfaces settings items; migration
 * `202609280007_composite_grants` moved the stored grants.
 */
export const ITAM_SETTINGS_RESOURCE = {
  type: 'settings',
  id: 'itam.settings',
} as const;
