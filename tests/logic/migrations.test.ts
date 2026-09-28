// @vitest-environment node
import addRepairNo from '../../database/main/migrations/202609190002_add_repair_no.js';
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
  'approvals',
  'repairs',
  'audit_tasks',
  'audit_items',
  'disposals',
  'disposal_devices',
  'demo_records',
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

  it('is applied once and rolls back cleanly', async () => {
    db = await createTestDatabase();
    const again = await db.migrator.latest();
    expect(again.executed).toEqual([]);

    const rolledBack = await db.migrator.rollback();
    expect(rolledBack.rolledBack.length).toBe(78);
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
