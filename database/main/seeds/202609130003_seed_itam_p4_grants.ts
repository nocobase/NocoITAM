import { defineSeed, type SeedDefinition } from '@nocobase/db';

/**
 * Repair, audit and disposal grants for the ITAM Permission Sets; only
 * missing resources are added. IT Support handles repairs and audits
 * without cost fields; Asset Managers see everything and decide approvals.
 *
 * A field list here names real columns: a name no column answers to grants
 * nothing and quietly outlives the migration that removed it. Two did —
 * `repairs.loanerDeviceId` (`202609190001_drop_repair_loaner`) and
 * `disposals.ownerId` (`202609190003_drop_disposal_owner`) — until
 * 2026-09-28.
 * (The ticket grants this seed once added went with the ticket module.)
 */
const REPAIR_FIELDS = [
  'id',
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
  'createdById',
  'createdAt',
  'updatedAt',
];
const REPAIR_INPUT = [
  'deviceId',
  'method',
  'vendorId',
  'faultDescription',
  'sentAt',
  'expectedReturnAt',
  'cost',
  'currency',
  'notes',
  'ownerId',
];
const AUDIT_INPUT = [
  'name',
  'scope',
  'plannedStart',
  'plannedEnd',
  'executorIds',
  'notes',
];
const DISPOSAL_FIELDS = [
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
  'createdById',
  'createdAt',
  'updatedAt',
];
const DISPOSAL_INPUT = [
  'method',
  'reason',
  'description',
  'ownerId',
  'requestedAt',
  'currency',
  // How it is to be carried out: stated with the request, confirmed by the
  // execution. Who carried it out is the execution's own answer.
  'recipientVendorId',
  'recipientName',
  'dataWipe',
  'wipeMethod',
];
const DISPOSAL_COST = ['bookValueTotal', 'proceeds', 'expenses'];
const without = (fields: readonly string[], excluded: readonly string[]) =>
  fields.filter((field) => !excluded.includes(field));

interface Grant {
  readonly resource: { readonly type: string; readonly id: string };
  readonly actions: readonly {
    readonly action: string;
    readonly policy?: unknown;
  }[];
}
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
const readFields = (output: readonly string[]) =>
  ({ fields: output, recordAccess: ['allRecords'] }) as const;
const write = (input: readonly string[]) =>
  ({ fields: input, recordAccess: ['allRecords'] }) as const;
/**
 * Scoped variants. `recordsICreated` is the authorization plugin's own
 * policy (it matches `createdById`); `itam.myAudits` is this application's,
 * for the tasks whose `executorIds` name the reader.
 */
const mine = (scope: string) =>
  ({ fields: '*', recordAccess: [scope] }) as const;

function itSupportGrants(): Grant[] {
  const repairOut = without(REPAIR_FIELDS, ['cost']);
  const disposalOut = without(DISPOSAL_FIELDS, DISPOSAL_COST);
  return [
    db('repairs', {
      read: readFields(repairOut),
      create: write(without(REPAIR_INPUT, ['cost', 'currency'])),
      update: write(without(REPAIR_INPUT, ['cost', 'currency'])),
      // A request belongs to the side that raised it: IT support closes and
      // deletes its own repair orders, not a colleague's.
      // Neither is limited to the records this reader created: the service
      // checks the repair's 负责人, which is the point of having one — a
      // repair can be handed over, its creator cannot.
      delete: write(repairOut),
      complete: write(repairOut),
    }),
    // An audit task is run by the people it names. IT support may raise one
    // and edit it, but reads and runs only the tasks it executes, and
    // deletes only the ones it raised.
    db('auditTasks', {
      read: mine('itam.myAudits'),
      create: write(AUDIT_INPUT),
      update: write(AUDIT_INPUT),
      delete: mine('recordsICreated'),
      start: mine('itam.myAudits'),
      count: mine('itam.myAudits'),
      finish: mine('itam.myAudits'),
      resolve: mine('itam.myAudits'),
      cancel: mine('itam.myAudits'),
      export: mine('itam.myAudits'),
    }),
    db('auditItems', { read: readAll }),
    db('disposals', {
      read: readFields(disposalOut),
      create: write(DISPOSAL_INPUT),
      update: write(DISPOSAL_INPUT),
      delete: mine('recordsICreated'),
      submit: readFields(disposalOut),
    }),
    db('disposalDevices', {
      read: readFields([
        'id',
        'disposalId',
        'deviceId',
        'statusBefore',
        'createdAt',
      ]),
    }),
  ];
}

function managerGrants(): Grant[] {
  return [
    db('repairs', {
      read: readAll,
      create: write(REPAIR_INPUT),
      update: write(REPAIR_INPUT),
      delete: all,
      complete: all,
    }),
    db('auditTasks', {
      read: readAll,
      create: write(AUDIT_INPUT),
      update: write(AUDIT_INPUT),
      delete: all,
      start: all,
      count: all,
      finish: all,
      resolve: all,
      cancel: all,
      export: all,
    }),
    db('auditItems', { read: readAll }),
    db('disposals', {
      read: readAll,
      create: write(DISPOSAL_INPUT),
      update: write(DISPOSAL_INPUT),
      delete: all,
      submit: all,
      approve: all,
      execute: all,
      export: all,
    }),
    db('disposalDevices', { read: readAll }),
  ];
}

const seed: SeedDefinition = defineSeed({
  name: '202609130003_seed_itam_p4_grants',

  async run({ query, connection }) {
    const client = await connection.client<{
      schema: { hasTable(t: string): Promise<boolean> };
    }>();
    if (!(await client.schema.hasTable('authorization_permission_sets')))
      return;
    const additions: readonly [string, Grant[]][] = [
      ['itam-it-support', splitOperations(itSupportGrants())],
      ['itam-asset-manager', splitOperations(managerGrants())],
    ];
    for (const [key, grants] of additions) {
      const set = await query
        .selectFrom('authorizationPermissionSets')
        .select(['key', 'grants'])
        .where('key', '=', key)
        .executeTakeFirst<{ key: string; grants: unknown }>();
      if (!set) continue;
      const current =
        typeof set.grants === 'string'
          ? (JSON.parse(set.grants) as Grant[])
          : (set.grants as Grant[]);
      const has = (grant: Grant) =>
        current.some(
          (existing) =>
            existing.resource.type === grant.resource.type &&
            existing.resource.id === grant.resource.id,
        );
      const missing = grants.filter((grant) => !has(grant));
      if (missing.length === 0) continue;
      await query
        .updateTable('authorizationPermissionSets')
        .set({
          grants: [...current, ...missing],
          updatedAt: new Date(),
        })
        .where('key', '=', key)
        .execute();
    }
  },
});

export default seed;
