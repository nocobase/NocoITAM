import { defineSeed, type SeedDefinition } from '@nocobase/db';

/**
 * The ITAM roles from the specification as Permission Sets: IT Support and
 * IT Asset Manager. Only IT signs in (2026-10-05); the employees are people
 * in the register, not accounts, so there is no Employee set.
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
const IT_SUPPORT = 'itam-it-support';
const ASSET_MANAGER = 'itam-asset-manager';

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
  // 入职配置 (2026-10-05).
  'onboardingKits',
];
const SYSTEM_READ = ['historyEvents', 'changeLogs', 'allocations', 'reminders'];

/**
 * Every page in the IT menu, by route name (`client/routes.ts`). A page with
 * a menu entry checks a grant named after its route, so this list is what
 * the two IT roles see when they sign in.
 */
const IT_PAGES = [
  'workbench',
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
];
/**
 * 报表 reads costs across the register, which is the Asset Manager's, and
 * so are the scheduled maintenance tasks (the scheduler plugin's 定时任务
 * page), beside the application settings the role already owns. 智能体工作
 * (2026-10-16) is what the work agents do on their own; `ADDED_PAGES` in
 * `reconcile-grants.ts` gives it to sets seeded before.
 */
const MANAGER_PAGES = [
  ...IT_PAGES,
  'reports',
  'scheduler.schedules',
  'agent-work',
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
 * IT Support is the Asset Manager minus the two things that are not about
 * the job (2026-10-05): **deciding** a request and **destroying** a record.
 *
 * The roles used to differ in a dozen places — cost fields, product keys,
 * master-data writes, people, the settings, the reports page, and a record
 * scope on each delete — and keeping two lists in step meant every new
 * field and every new page had to be added twice, which is how a role ends
 * up with a grant nobody meant to give it. Derived, the difference is the
 * code: support does the work, the manager approves it and clears it away.
 */
const minusApprovalAndDeletion = (grants: readonly Grant[]): Grant[] =>
  grants.flatMap((grant) => {
    const actions = grant.actions.filter(
      (entry) => entry.action !== 'delete' && entry.action !== 'approve',
    );
    return actions.length > 0 ? [{ ...grant, actions }] : [];
  });

function itSupportGrants(): Grant[] {
  return minusApprovalAndDeletion(assetManagerGrants());
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

    // Each title a translation key in the application's namespace, as the
    // plugin's own sets carry theirs, so the name follows the reader's
    // language (2026-10-16): `users.roles.<key>` in client/locales. A set
    // an administrator renames stores the name typed.
    const sets: readonly [string, Grant[]][] = [
      [IT_SUPPORT, splitOperations(itSupportGrants())],
      [ASSET_MANAGER, splitOperations(assetManagerGrants())],
    ];
    for (const [key, grants] of sets) {
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
          title: JSON.stringify({ key: `users.roles.${key}`, ns: 'itam' }),
          grants,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

export default seed;
