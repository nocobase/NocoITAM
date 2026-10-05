import { defineSeed, type SeedDefinition } from '@nocobase/db';

/**
 * Purchase order, approval and attachment grants for the ITAM Permission
 * Sets; only missing resources are added.
 */
const PO_FIELDS = [
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
  'createdById',
  'createdAt',
  'updatedAt',
];
const SYSTEM = [
  'id',
  'createdById',
  'createdAt',
  'updatedAt',
  'status',
  'orderNo',
  'estimatedTotal',
  'orderedAt',
  'receivedAt',
  'cancelReason',
];
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
const write = (input: readonly string[]) =>
  ({ fields: input, recordAccess: ['allRecords'] }) as const;

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
  return minusApprovalAndDeletion(managerGrants());
}

function managerGrants(): Grant[] {
  return [
    db('purchaseOrders', {
      read: readAll,
      create: write(without(PO_FIELDS, SYSTEM)),
      update: write(without(PO_FIELDS, SYSTEM)),
      delete: all,
      submit: all,
      approve: all,
      order: all,
      receive: all,
      export: all,
    }),
    db('purchaseOrderLines', { read: readAll }),
    db('purchaseReceipts', { read: readAll }),
    db('approvals', { read: readAll, decide: all }),
    db('attachmentLinks', { read: readAll, create: all, delete: all }),
  ];
}

const seed: SeedDefinition = defineSeed({
  name: '202609130002_seed_itam_p3_grants',

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
