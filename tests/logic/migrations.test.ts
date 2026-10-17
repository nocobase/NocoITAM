// @vitest-environment node
import addRepairNo from '../../database/main/migrations/202609190002_add_repair_no.js';
import compositeGrants from '../../database/main/migrations/202609280007_composite_grants.js';
import requestOwner from '../../database/main/migrations/202610050001_request_owner.js';
import auditOwner from '../../database/main/migrations/202610050002_audit_owner.js';
import disposalLifecycle from '../../database/main/migrations/202610180001_disposal_lifecycle.js';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createTestDatabase,
  schemaClient,
  type TestDatabase,
} from '../support/test-database.js';

const tables = [
  'manufacturers',
  'vendors',
  'categories',
  'models',
  'software_products',
  'locations',
  'departments',
  'people',
  'devices',
  'itam_settings',
  'number_sequences',
  'history_events',
  'change_logs',
  'allocations',
  'attachment_links',
  'reminders',
  'stock_items',
  'stock_holdings',
  'stock_movements',
  'entitlements',
  'entitlement_seats',
  'itam_files',
  'purchase_orders',
  'purchase_order_lines',
  'purchase_receipts',
  // Receiving by delivery document (2026-10-05).
  'receipt_runs',
  'approvals',
  'repairs',
  'audit_tasks',
  'audit_items',
  'disposals',
  'disposal_devices',
  'demo_records',
  // The lifecycle runtime's own log (2026-10-18).
  'lifecycle_transitions',
  'lifecycle_effect_runs',
  // The parameters an administrator sets on a lifecycle (2026-10-18).
  'lifecycle_parameter_heads',
  'lifecycle_parameter_versions',
  'lifecycle_parameter_selections',
  'lifecycle_parameter_requests',
  'lifecycle_parameter_snapshots',
  'lifecycle_parameter_usages',
];

describe('ITAM migrations', () => {
  let db: TestDatabase | undefined;

  afterEach(async () => {
    await db?.destroy();
    db = undefined;
  });

  it('creates every P0 table on up', async () => {
    db = await createTestDatabase();
    const client = await schemaClient(db.database);
    const present = Object.fromEntries(
      await Promise.all(
        tables.map(async (table) => [
          table,
          await client.schema.hasTable(table),
        ]),
      ),
    );
    expect(present).toEqual(
      Object.fromEntries(tables.map((table) => [table, true])),
    );
    expect(await client.schema.hasColumn('devices', 'device_no')).toBe(true);
    expect(await client.schema.hasColumn('devices', 'assignee_type')).toBe(
      true,
    );
    expect(await client.schema.hasColumn('categories', 'field_template')).toBe(
      true,
    );
    // Discovery was removed on 2026-09-27, with the device's last-seen time.
    expect(await client.schema.hasTable('discovery_imports')).toBe(false);
    // The AI action center went the same day, for the plugin's write tools.
    expect(await client.schema.hasTable('ai_actions')).toBe(false);
    expect(await client.schema.hasTable('ai_findings')).toBe(false);
    expect(await client.schema.hasTable('discovery_candidates')).toBe(false);
    expect(await client.schema.hasColumn('devices', 'last_discovered_at')).toBe(
      false,
    );
  });

  it('numbers existing repairs in creation order and continues the sequence after them', async () => {
    db = await createTestDatabase();
    const client = await schemaClient(db.database);
    const connection = db.database.connection();
    const context = {
      connection,
      query: connection.query,
      builder: connection.builder,
    };
    await addRepairNo.down!(context);
    expect(await client.schema.hasColumn('repairs', 'repair_no')).toBe(false);
    const repair = (id: string, createdAt: Date) => ({
      id,
      deviceId: 'device',
      method: 'internal',
      faultDescription: 'Old row',
      sentAt: '2026-01-01',
      result: 'repaired',
      createdAt,
      updatedAt: createdAt,
    });
    await connection.query
      .insertInto('repairs')
      .values([
        repair('later', new Date('2026-02-01')),
        repair('earlier', new Date('2026-01-01')),
      ])
      .execute();
    await addRepairNo.up(context);
    const rows = await connection.query
      .selectFrom('repairs')
      .select(['id', 'repairNo'])
      .orderBy('repairNo', 'asc')
      .execute<{ id: string; repairNo: string }>();
    expect(rows).toEqual([
      { id: 'earlier', repairNo: 'RP-000001' },
      { id: 'later', repairNo: 'RP-000002' },
    ]);
    expect(
      await connection.query
        .selectFrom('numberSequences')
        .select('nextValue')
        .where('key', '=', 'repair')
        .executeTakeFirst<{ nextValue: number }>(),
    ).toMatchObject({ nextValue: 3 });
  });

  it('gives every stocktake its creator as 负责人', async () => {
    db = await createTestDatabase();
    const client = await schemaClient(db.database);
    const connection = db.database.connection();
    const context = {
      connection,
      query: connection.query,
      builder: connection.builder,
    };
    await auditOwner.down!(context);
    expect(await client.schema.hasColumn('audit_tasks', 'owner_id')).toBe(
      false,
    );
    const now = new Date();
    await connection.query
      .insertInto('auditTasks')
      .values({
        id: 'task',
        name: 'Warehouse',
        scope: {},
        plannedStart: '2026-10-01',
        plannedEnd: '2026-10-20',
        executorIds: ['sam'],
        status: 'inProgress',
        createdById: 'mia',
        createdAt: now,
        updatedAt: now,
      })
      .execute();

    await auditOwner.up(context);
    // The creator, not an executor: who organised it is who answered for it
    // while the field was gone.
    expect(
      await connection.query
        .selectFrom('auditTasks')
        .select('ownerId')
        .executeTakeFirst(),
    ).toEqual({ ownerId: 'mia' });
  });

  it("moves a request's requester to its owner, with the recorded changes", async () => {
    db = await createTestDatabase();
    const client = await schemaClient(db.database);
    const connection = db.database.connection();
    const context = {
      connection,
      query: connection.query,
      builder: connection.builder,
    };
    await requestOwner.down!(context);
    expect(await client.schema.hasColumn('purchase_orders', 'owner_id')).toBe(
      false,
    );
    const now = new Date();
    await connection.query
      .insertInto('purchaseOrders')
      .values({
        id: 'po',
        orderNo: 'PO-1',
        reason: 'other',
        requesterId: 'mia',
        status: 'draft',
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    await connection.query
      .insertInto('disposals')
      .values({
        id: 'dp',
        disposalNo: 'DP-1',
        method: 'scrap',
        reason: 'other',
        requesterId: 'sam',
        status: 'draft',
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    await connection.query
      .insertInto('changeLogs')
      .values({
        id: 'change',
        subjectType: 'purchaseOrders',
        subjectId: 'po',
        action: 'update',
        field: 'requesterId',
        createdAt: now,
      })
      .execute();

    await requestOwner.up(context);
    expect(
      await connection.query
        .selectFrom('purchaseOrders')
        .select('ownerId')
        .executeTakeFirst(),
    ).toEqual({ ownerId: 'mia' });
    expect(
      await connection.query
        .selectFrom('disposals')
        .select('ownerId')
        .executeTakeFirst(),
    ).toEqual({ ownerId: 'sam' });
    expect(
      await connection.query
        .selectFrom('changeLogs')
        .select('field')
        .where('id', '=', 'change')
        .executeTakeFirst(),
    ).toEqual({ field: 'ownerId' });
    expect(
      await client.schema.hasColumn('purchase_orders', 'requester_id'),
    ).toBe(false);
    expect(await client.schema.hasColumn('disposals', 'requester_id')).toBe(
      false,
    );
  });

  it('moves stored operation and settings grants to composites and back', async () => {
    db = await createTestDatabase();
    const connection = db.database.connection();
    const context = {
      connection,
      query: connection.query,
      builder: connection.builder,
    };
    // The authorization plugin owns this table; the ITAM migrations alone
    // do not create it.
    await connection.builder.createCollection(
      'authorizationPermissionSets',
      (collection) => {
        collection.string('id', { length: 64, primary: true });
        collection.string('key', { length: 255, nullable: false });
        collection.json('grants', { nullable: false });
        collection.datetime('createdAt', { nullable: false });
        collection.datetime('updatedAt', { nullable: false });
      },
    );
    const page = {
      resource: { type: 'page', id: 'devices' },
      actions: [{ action: 'access' }],
    };
    const before = [
      page,
      {
        resource: { type: 'resource', id: 'itam.devices' },
        actions: [
          {
            action: 'assign',
            policy: { type: 'resource', devices: 'allRecords' },
          },
        ],
      },
      {
        resource: { type: 'itam.settings', id: 'general' },
        actions: [{ action: 'read' }, { action: 'update' }],
      },
    ];
    const now = new Date();
    await connection.query
      .insertInto('authorizationPermissionSets')
      .values({
        id: 'set',
        key: 'set',
        grants: before,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const grants = async () =>
      (
        await connection.query
          .selectFrom('authorizationPermissionSets')
          .select('grants')
          .where('id', '=', 'set')
          .executeTakeFirst<{ grants: unknown }>()
      )?.grants;

    await compositeGrants.up(context);
    expect(await grants()).toEqual([
      page,
      {
        resource: { type: 'composite', id: 'itam.devices' },
        actions: [
          {
            action: 'assign',
            policy: { type: 'composite', scopes: { devices: 'allRecords' } },
          },
        ],
      },
      {
        resource: { type: 'settings', id: 'itam.settings' },
        actions: [{ action: 'read' }, { action: 'update' }],
      },
    ]);
    await compositeGrants.down!(context);
    expect(await grants()).toEqual(before);
  });

  it('enforces unique device numbers', async () => {
    db = await createTestDatabase();
    const query = db.database.query();
    const row = {
      id: 'a1',
      deviceNo: 'DE-000001',
      name: 'Laptop',
      modelId: 'm1',
      categoryId: 'c1',
      manufacturerId: 'mf1',
      status: 'inStock',
      ownership: 'owned',
      locationId: 'l1',
      depreciationMethod: 'none',
      ownerId: 'u1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await query.insertInto('devices').values(row).execute();
    await expect(
      query
        .insertInto('devices')
        .values({ ...row, id: 'a2' })
        .execute(),
    ).rejects.toThrow();
  });

  it('leaves a department without its code or cost center', async () => {
    db = await createTestDatabase();
    const client = await schemaClient(db.database);
    expect(await client.schema.hasColumn('departments', 'code')).toBe(false);
    expect(await client.schema.hasColumn('departments', 'cost_center')).toBe(
      false,
    );
    expect(await client.schema.hasColumn('departments', 'name')).toBe(true);
  });

  it('gives disposals what their lifecycle keeps beside the state', async () => {
    db = await createTestDatabase();
    const client = await schemaClient(db.database);
    expect(
      await client.schema.hasColumn('disposals', 'status_changed_at'),
    ).toBe(true);
    expect(
      await client.schema.hasColumn('disposals', 'lifecycle_version'),
    ).toBe(true);
    expect(await client.schema.hasTable('lifecycle_transitions')).toBe(true);
    expect(await client.schema.hasTable('lifecycle_effect_runs')).toBe(true);
  });

  it('dates when a disposal already there entered its state, from its last write', async () => {
    // The first version wrote `updatedAt` as it reads back — local text —
    // into the zoned field and failed on every database with a disposal.
    db = await createTestDatabase();
    const connection = db.database.connection();
    const context = {
      connection,
      query: connection.query,
      builder: connection.builder,
    };
    await disposalLifecycle.down!(context);
    const written = new Date('2026-10-16T14:51:55.255Z');
    await connection.query
      .insertInto('disposals')
      .values({
        id: 'dp',
        disposalNo: 'DP-1',
        method: 'scrap',
        reason: 'other',
        ownerId: 'sam',
        status: 'pendingApproval',
        createdAt: written,
        updatedAt: written,
      })
      .execute();
    await disposalLifecycle.up(context);
    const row = await connection.query
      .selectFrom('disposals')
      .select(['statusChangedAt', 'lifecycleVersion'])
      .executeTakeFirst<{
        statusChangedAt: unknown;
        lifecycleVersion: unknown;
      }>();
    expect(new Date(String(row?.statusChangedAt)).getTime()).toBe(
      written.getTime(),
    );
    expect(Number(row?.lifecycleVersion)).toBe(0);
  });

  it('is applied once and rolls back cleanly', async () => {
    db = await createTestDatabase();
    const again = await db.migrator.latest();
    expect(again.executed).toEqual([]);

    const rolledBack = await db.migrator.rollback();
    expect(rolledBack.rolledBack.length).toBe(109);
    const client = await schemaClient(db.database);
    const remaining = Object.fromEntries(
      await Promise.all(
        tables.map(async (table) => [
          table,
          await client.schema.hasTable(table),
        ]),
      ),
    );
    expect(remaining).toEqual(
      Object.fromEntries(tables.map((table) => [table, false])),
    );
  });
});
