import { defineSeed, type SeedDefinition } from '@nocobase/db';

/**
 * The ITAM roles from the specification as Permission Sets: Employee,
 * IT Support and IT Asset Manager.
 *
 * There is no administrator role of this application's own. The platform's
 * `root` set is unrestricted — the authorization core permits every request
 * from whoever holds it without reading a grant — so an ITAM copy of "may do
 * everything" would be a second thing to keep in step with the first for no
 * added power. Configuring this application belongs to the Asset Manager,
 * who owns its settings; the platform's own administration stays with root.
 *
 * Grants are written in the authorization plugin's stored shape. Field lists
 * are spelled out here rather than imported: a seed is history and must not
 * change meaning when the runtime registry evolves.
 */
const EMPLOYEE = 'itam-employee';
const IT_SUPPORT = 'itam-it-support';
const ASSET_MANAGER = 'itam-asset-manager';

const DEVICE_COST_FIELDS = ['purchasePrice', 'bookValue', 'depreciatedAmount'];
const DEVICE_FINANCE_FIELDS = [
  ...DEVICE_COST_FIELDS,
  'currency',
  'depreciationMethod',
  'usefulLifeMonths',
  'residualRate',
];
const DEVICE_FIELDS = [
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
  'createdById',
  'createdAt',
  'updatedAt',
];
const DEVICE_SYSTEM_FIELDS = [
  'id',
  'deviceNo',
  'createdById',
  'createdAt',
  'updatedAt',
  'bookValue',
  'depreciatedAmount',
];
const without = (fields: readonly string[], excluded: readonly string[]) =>
  fields.filter((field) => !excluded.includes(field));

const MASTER_DATA = [
  'manufacturers',
  'vendors',
  'categories',
  'models',
  'softwareProducts',
  'locations',
  'departments',
  'people',
];
const SYSTEM_READ = ['historyEvents', 'changeLogs', 'allocations', 'reminders'];

/**
 * Every page in the IT menu, by route name (`client/routes.ts`). A page with
 * a menu entry checks a grant named after its route, so this list is what
 * the two IT roles see when they sign in.
 */
const IT_PAGES = [
  'workbench',
  'inbox',
  'notifications',
  'devices',
  'accessories',
  'consumables',
  'components',
  'software-products',
  'entitlements',
  'procurement',
  'repairs',
  'audits',
  'disposals',
  'master-data-overview',
  'categories',
  'models',
  'manufacturers',
  'vendors',
  'locations',
  'departments',
  'people',
  // Everyone holds assets, including the people who administer them.
  'my-assets',
];
/**
 * 报表 reads costs across the register, which is the Asset Manager's, and
 * so are the scheduled maintenance tasks (the scheduler plugin's 定时任务
 * page), beside the application settings the role already owns.
 */
const MANAGER_PAGES = [...IT_PAGES, 'reports', 'scheduler.schedules'];
/** An employee's whole application: the workbench and what they hold. */
const EMPLOYEE_PAGES = [
  'workbench',
  'inbox',
  'notifications',
  'my-assets',
];

interface Grant {
  readonly resource: { readonly type: string; readonly id: string };
  readonly actions: readonly {
    readonly action: string;
    readonly policy?: unknown;
  }[];
}

const page = (id: string): Grant => ({
  resource: { type: 'page', id },
  actions: [{ action: 'access' }],
});

const db = (
  collection: string,
  actions: Readonly<
    Record<
      string,
      {
        fields?: '*' | readonly string[];
        recordAccess?: readonly unknown[];
      }
    >
  >,
): Grant => ({
  resource: { type: 'database.collection', id: `main.${collection}` },
  actions: Object.entries(actions).map(([action, config]) => ({
    action,
    policy: { type: 'database', ...config },
  })),
});

/**
 * Splits a Collection grant into what the Collection owns and what its
 * operations own.
 *
 * Since template beta.43 `read` / `create` / `update` / `delete` are the
 * Collection's actions, while an operation such as `assign` or `issue` is
 * granted on the composite resource declared for it
 * (`server/providers/itam/authz-resources.ts`). The fields an operation may
 * write live in that declaration, so only the record-access choice is stored
 * here.
 */
const CRUD_ACTIONS = new Set(['read', 'create', 'update', 'delete']);

const splitOperations = (grants: readonly Grant[]): Grant[] =>
  grants.flatMap((grant) => {
    if (grant.resource.type !== 'database.collection') return [grant];
    const collection = grant.resource.id.replace(/^main\./, '');
    const owned = grant.actions.filter((entry) =>
      CRUD_ACTIONS.has(entry.action),
    );
    const operations = grant.actions.filter(
      (entry) => !CRUD_ACTIONS.has(entry.action),
    );
    return [
      ...(owned.length > 0 ? [{ ...grant, actions: owned }] : []),
      ...(operations.length > 0
        ? [
            {
              resource: { type: 'composite', id: `itam.${collection}` },
              actions: operations.map((entry) => ({
                action: entry.action,
                policy: {
                  type: 'composite',
                  scopes: { [collection]: recordAccessOf(entry.policy) },
                },
              })),
            },
          ]
        : []),
    ];
  });

/** The record-access reference a stored operation grant carries. */
const recordAccessOf = (policy: unknown): string => {
  const selected = (policy as { recordAccess?: readonly unknown[] } | undefined)
    ?.recordAccess?.[0];
  return typeof selected === 'string' ? selected : 'allRecords';
};

/**
 * A policy states one field list for its action: what a read returns, what a
 * write accepts. The plugin drops a policy whose `fields` it does not
 * recognise, so the pre-beta.43 `{ input, output }` shape grants nothing at
 * all. What a write may then show back is the caller's own `read` grant
 * (`decideWith` in `server/providers/itam/authz-resources.ts`).
 */
const all = { fields: '*', recordAccess: ['allRecords'] } as const;
const readAll = all;

/**
 * An employee reads what they hold and nothing else. The master data here is
 * only what 我的资产 and a device's own page print instead of an id — a
 * model, category, maker, place and department name — not a list they can
 * reach. There is no stock or entitlement grant: 我的资产 lists devices, and
 * an employee has no page that shows what is in the store room.
 */
function employeeGrants(): Grant[] {
  return [
    ...EMPLOYEE_PAGES.map(page),
    db('devices', {
      read: {
        fields: without(DEVICE_FIELDS, DEVICE_FINANCE_FIELDS),
        recordAccess: ['itam.assetsIHold'],
      },
    }),
    db('people', {
      read: { fields: '*', recordAccess: ['itam.myPerson'] },
    }),
    db('models', { read: readAll }),
    db('categories', { read: readAll }),
    db('manufacturers', { read: readAll }),
    db('locations', { read: readAll }),
    db('departments', { read: readAll }),
  ];
}

function itSupportGrants(): Grant[] {
  const deviceReadable = without(DEVICE_FIELDS, DEVICE_COST_FIELDS);
  return [
    ...IT_PAGES.map(page),
    ...MASTER_DATA.map((collection) => db(collection, { read: readAll })),
    ...SYSTEM_READ.map((collection) => db(collection, { read: readAll })),
    db('devices', {
      read: {
        fields: deviceReadable,
        recordAccess: ['allRecords'],
      },
      create: {
        fields: without(DEVICE_FIELDS, [
          ...DEVICE_SYSTEM_FIELDS,
          ...DEVICE_COST_FIELDS,
        ]),
      },
      update: {
        fields: without(DEVICE_FIELDS, [
          ...DEVICE_SYSTEM_FIELDS,
          ...DEVICE_FINANCE_FIELDS,
        ]),
        recordAccess: ['allRecords'],
      },
      assign: {
        fields: deviceReadable,
        recordAccess: ['allRecords'],
      },
      return: {
        fields: deviceReadable,
        recordAccess: ['allRecords'],
      },
      transfer: {
        fields: deviceReadable,
        recordAccess: ['allRecords'],
      },
      loan: {
        fields: deviceReadable,
        recordAccess: ['allRecords'],
      },
      reserve: {
        fields: deviceReadable,
        recordAccess: ['allRecords'],
      },
      export: {
        fields: deviceReadable,
        recordAccess: ['allRecords'],
      },
    }),
  ];
}

function assetManagerGrants(): Grant[] {
  return [
    ...MANAGER_PAGES.map(page),
    ...MASTER_DATA.map((collection) =>
      db(collection, { read: readAll, create: all, update: all, delete: all }),
    ),
    db('people', {
      read: readAll,
      create: all,
      update: all,
      delete: all,
      markLeft: all,
    }),
    ...SYSTEM_READ.map((collection) => db(collection, { read: readAll })),
    db('reminders', { read: readAll, update: all }),
    db('devices', {
      read: readAll,
      create: {
        fields: without(DEVICE_FIELDS, DEVICE_SYSTEM_FIELDS),
      },
      update: {
        fields: without(DEVICE_FIELDS, DEVICE_SYSTEM_FIELDS),
        recordAccess: ['allRecords'],
      },
      assign: all,
      return: all,
      transfer: all,
      loan: all,
      reserve: all,
      correctStatus: all,
      export: all,
    }),
    {
      resource: { type: 'settings', id: 'itam.settings' },
      actions: [{ action: 'read' }, { action: 'update' }],
    },
  ];
}

const seed: SeedDefinition = defineSeed({
  name: '202609120003_seed_itam_permission_sets',

  async run({ query, connection }) {
    const client = await connection.client<{
      schema: { hasTable(t: string): Promise<boolean> };
    }>();
    if (!(await client.schema.hasTable('authorization_permission_sets')))
      return;
    const now = new Date();

    const sets: readonly [string, string, Grant[]][] = [
      [EMPLOYEE, 'Employee', splitOperations(employeeGrants())],
      [IT_SUPPORT, 'IT Support', splitOperations(itSupportGrants())],
      [
        ASSET_MANAGER,
        'IT Asset Manager',
        splitOperations(assetManagerGrants()),
      ],
    ];
    for (const [key, title, grants] of sets) {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select('key')
        .where('key', '=', key)
        .executeTakeFirst();
      if (existing) continue;
      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: crypto.randomUUID(),
          key,
          // A title is stored encoded: plain text or a { key, ns } descriptor.
          title: JSON.stringify(title),
          grants,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

export default seed;
