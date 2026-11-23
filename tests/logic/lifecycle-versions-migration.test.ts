// @vitest-environment node
import {
  createRepositoryLifecycleStore,
  LifecycleRuntime,
  StoredLifecycleParameters,
  type ParameterSource,
} from '@nocobase/lifecycle';
import { afterEach, expect, it } from 'vitest';

import bindings from '../../database/main/migrations/202611230001_lifecycle_definition_bindings.js';
import snapshots from '../../database/main/migrations/202611230002_lifecycle_parameter_snapshots.js';
import {
  disposalApproverRange,
  disposalLifecycle,
} from '../../server/lifecycles/disposals.js';
import {
  createTestDatabase,
  schemaClient,
  type TestDatabase,
} from '../support/test-database.js';

// The lifecycle versions upgrade (2026-11-23, lifecycle 0.1.0-beta.6): each
// record names the definition that created it, the approver range moves to
// the definition's own configuration, and every disposal and purchase order
// gets the parameter snapshot the runtime now reads — from its creation's
// recorded usage where the released runtime left one, from the range at
// upgrade otherwise. The two migrations are run back down, given the data a
// released deployment had, and run up again.

let db: TestDatabase | undefined;
afterEach(async () => {
  await db?.destroy();
  db = undefined;
});

const SCOPE = 'itam';

async function released() {
  db = await createTestDatabase();
  const connection = db.database.connection();
  const context = {
    connection,
    query: connection.query,
    builder: connection.builder,
  };
  await snapshots.down(context);
  await bindings.down(context);
  const store = createRepositoryLifecycleStore(db.database);
  const parameters = new StoredLifecycleParameters(store);
  return { connection, context, store, parameters };
}

const at = new Date('2026-11-01T09:00:00Z');

async function insertDisposal(
  query: Awaited<ReturnType<typeof released>>['connection']['query'],
  id: string,
  status = 'draft',
) {
  await query
    .insertInto('disposals')
    .values({
      id,
      disposalNo: `DP-${id}`,
      method: 'recycle',
      reason: 'obsolete',
      description: 'Old laptops',
      status,
      ownerId: 'mia',
      createdById: 'mia',
      deviceCount: 2,
      createdAt: at,
      updatedAt: at,
      statusChangedAt: at,
      lifecycleVersion: 1,
    })
    .execute();
}

async function insertOrder(
  query: Awaited<ReturnType<typeof released>>['connection']['query'],
  id: string,
) {
  await query
    .insertInto('purchaseOrders')
    .values({
      id,
      orderNo: `PO-${id}`,
      reason: 'other',
      status: 'completed',
      ownerId: 'mia',
      createdById: 'mia',
      createdAt: at,
      updatedAt: at,
    })
    .execute();
}

async function insertCreation(
  query: Awaited<ReturnType<typeof released>>['connection']['query'],
  lifecycle: string,
  recordId: string,
): Promise<string> {
  await query
    .insertInto('lifecycleTransitions')
    .values({
      lifecycle,
      recordId,
      transition: '$create',
      from: null,
      to: 'draft',
      actorId: 'mia',
      input: {},
      at,
      version: 1,
      requestId: null,
      requestKey: '$v:1',
    })
    .execute();
  const entry = await query
    .selectFrom('lifecycleTransitions')
    .select(['id'])
    .where('lifecycle', '=', lifecycle)
    .where('recordId', '=', recordId)
    .where('transition', '=', '$create')
    .executeTakeFirst<{ id: unknown }>();
  return String(entry?.id);
}

const bound = async (
  query: Awaited<ReturnType<typeof released>>['connection']['query'],
  table: string,
) =>
  Object.fromEntries(
    (
      await query
        .selectFrom(table)
        .select(['id', 'lifecycleDefinition'])
        .execute<{ id: string; lifecycleDefinition: string | null }>()
    ).map((row) => [row.id, row.lifecycleDefinition]),
  );

it('binds every record to its table’s definition, and refuses a record another definition created', async () => {
  const { connection, context } = await released();
  const { query } = connection;
  await insertOrder(query, 'started');
  await insertCreation(query, 'purchaseOrders', 'started');
  // Written before the lifecycle, or by the demo: no `$create` entry.
  await insertOrder(query, 'adopted');
  await insertDisposal(query, 'd1');

  // A creation that names another definition stops it, changing nothing.
  await insertCreation(query, 'disposals', 'adopted');
  await expect(bindings.up(context)).rejects.toThrow(
    'purchaseOrders adopted: purchaseOrders, disposals',
  );
  const client = await schemaClient(db!.database);
  expect(
    await client.schema.hasColumn('purchase_orders', 'lifecycle_definition'),
  ).toBe(false);

  await query
    .deleteFrom('lifecycleTransitions')
    .where('lifecycle', '=', 'disposals')
    .where('recordId', '=', 'adopted')
    .execute();
  await bindings.up(context);
  expect(await bound(query, 'purchaseOrders')).toEqual({
    started: 'purchaseOrders',
    adopted: 'purchaseOrders',
  });
  expect(await bound(query, 'disposals')).toEqual({ d1: 'disposals' });

  await bindings.down(context);
  expect(
    await client.schema.hasColumn('disposals', 'lifecycle_definition'),
  ).toBe(false);
});

it('freezes each request’s range from its creation, or from the range at upgrade, and runs on it', async () => {
  const { connection, context, store, parameters } = await released();
  const { query } = connection;
  // The released range, saved twice under the group's own key.
  for (const [revision, referenceId] of [
    [0, 'itam-asset-manager'],
    [1, 'it-lead'],
  ] as const)
    await parameters.save({
      scope: SCOPE,
      group: disposalApproverRange,
      values: { approverRange: [{ group: 1, type: 'role', referenceId }] },
      expectedRevision: revision,
      requestId: `save-${String(revision)}`,
      actorId: 'root',
      at: '2026-10-20T08:00:00.000Z',
    });
  // A disposal the released runtime created, which recorded the range it
  // was created under; and one with no creation.
  await insertDisposal(query, 'created');
  const entryId = await insertCreation(query, 'disposals', 'created');
  const releasedSource = {
    group: 'disposalApprovers',
    schemaVersion: 1,
    revision: 1,
    origin: 'configuration',
    readMode: 'live',
  } as unknown as ParameterSource;
  await parameters.saveUsage({
    scope: SCOPE,
    revision: 1,
    values: {
      approverRange: [
        { group: 1, type: 'role', referenceId: 'itam-asset-manager' },
      ],
    },
    sources: { approverRange: releasedSource },
    lifecycle: 'disposals',
    recordId: 'created',
    kind: 'transition',
    associationId: entryId,
    at: '2026-10-21T08:00:00.000Z',
  });
  await insertDisposal(query, 'adopted');
  // An order, with no range ever saved.
  await insertOrder(query, 'order');

  await bindings.up(context);
  await snapshots.up(context);

  // The range is the definition's configuration now, at the same revision.
  const configuration = await parameters.readConfiguration(SCOPE, 'disposals');
  expect(configuration).toMatchObject({
    revision: 2,
    values: {
      approverRange: [{ group: 1, type: 'role', referenceId: 'it-lead' }],
    },
    actorId: 'root',
  });
  const created = await parameters.snapshot(SCOPE, 'disposals', 'created');
  expect(created).toMatchObject({
    revision: 1,
    values: {
      approverRange: [
        { group: 1, type: 'role', referenceId: 'itam-asset-manager' },
      ],
    },
    sources: {
      approverRange: {
        group: 'disposalApprovers',
        schemaVersion: 1,
        revision: 1,
        origin: 'configuration',
      },
    },
    at: '2026-10-21T08:00:00.000Z',
    recoveredFrom: {
      transitionId: entryId,
      groupRevisions: { disposalApprovers: 1 },
    },
  });
  expect(created?.sources.approverRange).not.toHaveProperty('readMode');
  expect(
    await parameters.snapshot(SCOPE, 'disposals', 'adopted'),
  ).toMatchObject({
    revision: 2,
    values: {
      approverRange: [{ group: 1, type: 'role', referenceId: 'it-lead' }],
    },
    sources: { approverRange: { revision: 2, origin: 'upgrade' } },
  });
  expect(
    await parameters.snapshot(SCOPE, 'purchaseOrders', 'order'),
  ).toMatchObject({
    revision: 0,
    values: { approverRange: [{ group: 1, type: 'anyone', referenceId: '*' }] },
    sources: {
      approverRange: { group: 'purchaseOrderApprovers', origin: 'upgrade' },
    },
  });

  // The upgraded disposal runs on its snapshot, and a new one is bound and
  // frozen under the configuration in force.
  const runtime = new LifecycleRuntime({ store });
  runtime.register(disposalLifecycle, {
    services: {
      approvals: async () => [],
      notifier: { notify: async () => undefined, deliver: async () => {} },
    },
    parameterConfiguration: { store: parameters, scope: () => SCOPE },
  });
  expect(await runtime.boundLifecycle('disposals', 'adopted')).toBe(
    'disposals',
  );
  const moved = await runtime.fire('disposals', 'adopted', 'submit', {
    actor: { id: 'mia' },
    input: { approverIds: ['ann'], requestedById: 'mia' },
  });
  expect(moved.record.status).toBe('pendingApproval');
  const fresh = await runtime.create(
    'disposals',
    {
      id: 'fresh',
      disposalNo: 'DP-fresh',
      method: 'recycle',
      reason: 'obsolete',
      ownerId: 'mia',
      createdById: 'mia',
      deviceCount: 1,
      createdAt: at,
      updatedAt: at,
    },
    { actor: { id: 'mia' } },
  );
  expect(fresh.record.lifecycleDefinition).toBe('disposals');
  expect(await parameters.snapshot(SCOPE, 'disposals', 'fresh')).toMatchObject({
    revision: 2,
    sources: { approverRange: { revision: 2, origin: 'configuration' } },
  });

  // Down takes off what up wrote: the snapshots it made and the copy.
  await snapshots.down(context);
  expect(await parameters.snapshot(SCOPE, 'disposals', 'created')).toBe(
    undefined,
  );
  expect(await parameters.snapshot(SCOPE, 'disposals', 'adopted')).toBe(
    undefined,
  );
  expect(await parameters.snapshot(SCOPE, 'disposals', 'fresh')).toBeDefined();
  expect(await parameters.readConfiguration(SCOPE, 'disposals')).toBe(
    undefined,
  );
  expect(await parameters.read(SCOPE, disposalApproverRange.key)).toMatchObject(
    { revision: 2 },
  );
});

it('stops on a request created twice, writing nothing', async () => {
  const { connection, context, parameters } = await released();
  const { query } = connection;
  await insertDisposal(query, 'twice');
  await insertCreation(query, 'disposals', 'twice');
  await query
    .insertInto('lifecycleTransitions')
    .values({
      lifecycle: 'disposals',
      recordId: 'twice',
      transition: '$create',
      from: null,
      to: 'draft',
      actorId: 'mia',
      input: {},
      at,
      version: 2,
      requestId: null,
      requestKey: '$v:2',
    })
    .execute();
  await bindings.up(context);
  await expect(snapshots.up(context)).rejects.toThrow(
    'disposals twice: 2 $create entries',
  );
  expect(await parameters.snapshot(SCOPE, 'disposals', 'twice')).toBe(
    undefined,
  );
});
