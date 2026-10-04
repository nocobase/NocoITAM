// @vitest-environment node
import path from 'node:path';

import { createSeeder } from '@nocobase/db';
import { afterEach, describe, expect, it } from 'vitest';

import { reconcileGrants } from '../../server/providers/itam/reconcile-grants.js';
import {
  createTestDatabase,
  type TestDatabase,
} from '../support/test-database.js';

const seedsDirectory = path.resolve(process.cwd(), 'database/main/seeds');

/** A grant as the seeds write it; the JSON column reads back decoded. */
interface Grant {
  readonly resource: { readonly type: string; readonly id: string };
  readonly actions: readonly {
    readonly action: string;
    readonly policy?: {
      readonly fields?: '*' | readonly string[];
      readonly recordAccess?: readonly string[];
    };
  }[];
}

describe('ITAM seeds', () => {
  let db: TestDatabase | undefined;

  afterEach(async () => {
    await db?.destroy();
    db = undefined;
  });

  it('seeds settings and categories once', async () => {
    db = await createTestDatabase();
    const seeder = createSeeder({
      database: db.database,
      packageName: 'itam',
      directory: seedsDirectory,
    });
    const first = await seeder.run();
    expect(first.executed.length).toBeGreaterThanOrEqual(3);

    const query = db.database.query();
    const settings = await query
      .selectFrom('itamSettings')
      .select('key')
      .execute();
    expect(settings.map((row) => row.key).sort()).toContain('thresholds');
    const categories = await query
      .selectFrom('categories')
      .select('id')
      .execute();
    expect(categories.length).toBeGreaterThan(20);

    const second = await seeder.run();
    expect(second.executed).toEqual([]);
  });

  it('seeds the assistant business notes, also into an AI row written first', async () => {
    db = await createTestDatabase();
    // The registrar may record its flag before the seeds run.
    await db.database
      .query()
      .insertInto('itamSettings')
      .values({
        key: 'ai',
        value: { builtInEmployeesDisabled: true },
        updatedById: null,
        updatedAt: new Date(),
      })
      .execute();
    await createSeeder({
      database: db.database,
      packageName: 'itam',
      directory: seedsDirectory,
    }).run();
    const row = await db.database
      .query()
      .selectFrom('itamSettings')
      .select('value')
      .where('key', '=', 'ai')
      .executeTakeFirst<{ value: unknown }>();
    let value = row?.value;
    while (typeof value === 'string') value = JSON.parse(value);
    const ai = value as {
      businessNotes: string;
      builtInEmployeesDisabled: boolean;
    };
    // Written in the deployment's language; either version names the
    // seeded models and software.
    expect(ai.builtInEmployeesDisabled).toBe(true);
    expect(ai.businessNotes.startsWith('## ')).toBe(true);
    expect(ai.businessNotes).toContain('MacBook Pro 14 M3');
    expect(ai.businessNotes).toContain('IntelliJ IDEA Ultimate');
  });

  it('creates the ITAM permission sets when the authorization tables exist', async () => {
    db = await createTestDatabase();
    await db.database
      .builder()
      .createCollection('authorizationPermissionSets', (collection) => {
        collection.string('id', { length: 64 }).notNull();
        collection.string('key', { length: 255 }).notNull();
        collection.string('title', { length: 255 }).nullable();
        collection.json('grants').notNull();
        collection.datetime('createdAt').notNull();
        collection.datetime('updatedAt').notNull();
        collection.primary('id');
        collection.unique('key');
      });
    const now = new Date();
    await db.database
      .query()
      .insertInto('authorizationPermissionSets')
      .values({
        id: 'admin',
        key: 'system-administrator',
        title: 'System administrator',
        grants: JSON.stringify([
          {
            resource: { type: 'page', id: '*' },
            actions: [{ action: 'access' }],
          },
        ]),
        createdAt: now,
        updatedAt: now,
      })
      .execute();

    await createSeeder({
      database: db.database,
      packageName: 'itam',
      directory: seedsDirectory,
    }).run();

    const rows = (await db.database
      .query()
      .selectFrom('authorizationPermissionSets')
      .select(['key', 'grants'])
      .execute()) as { key: string; grants: Grant[] }[];
    const keys = rows.map((row) => row.key).sort();
    expect(keys).toEqual([
      'itam-asset-manager',
      'itam-employee',
      'itam-it-support',
      'system-administrator',
    ]);

    // This application issues the platform's administrator set nothing: the
    // `root` set is unrestricted, so an ITAM copy of "may do everything"
    // would be a second thing to keep in step for no added power.
    const admin = rows.find((row) => row.key === 'system-administrator');
    const adminGrants = admin?.grants ?? [];
    expect(
      adminGrants.some((grant) => grant.resource.id.startsWith('main.')),
    ).toBe(false);
    expect(
      adminGrants.some((grant) => grant.resource.id.startsWith('itam.')),
    ).toBe(false);
    expect(
      adminGrants.some(
        (grant) => grant.resource.type === 'page' && grant.resource.id === '*',
      ),
    ).toBe(true);

    const employee = rows.find((row) => row.key === 'itam-employee');
    const employeeGrants = employee?.grants ?? [];
    const deviceRead = employeeGrants.find(
      (grant) => grant.resource.id === 'main.devices',
    )?.actions[0];
    expect(deviceRead?.policy?.recordAccess).toEqual(['itam.assetsIHold']);
    // One list per action since beta.43, not `{ input, output }`: the plugin
    // drops a policy whose `fields` it does not recognise, which silently
    // grants nothing.
    expect(deviceRead?.policy?.fields).not.toContain('purchasePrice');
    expect(deviceRead?.policy?.fields).toContain('deviceNo');

    // The seeds grant nothing the application no longer has — no tickets,
    // contracts or bills — so a data reset leaves nothing for the startup
    // step to strip. The merged entitlements collection is granted directly.
    for (const row of rows)
      expect(
        row.grants
          .map((grant) => grant.resource.id)
          .filter((id) => /ticket|contract|Bills/.test(id)),
      ).toEqual([]);
    // An employee reads what they hold and the names their own device page
    // prints — not the store room, and not the software the company owns.
    expect(
      employeeGrants
        .filter((grant) => grant.resource.type === 'database.collection')
        .map((grant) => grant.resource.id)
        .sort(),
    ).toEqual([
      'main.attachmentLinks',
      'main.categories',
      'main.departments',
      'main.devices',
      'main.locations',
      'main.manufacturers',
      'main.models',
      'main.people',
    ]);
    // Their whole application is two pages.
    expect(
      employeeGrants
        .filter((grant) => grant.resource.type === 'page')
        .map((grant) => grant.resource.id),
    ).toEqual(['workbench', 'inbox', 'notifications', 'my-assets']);
    const updated: string[] = [];
    await reconcileGrants({
      list: async () => rows,
      update: async (key: string) => {
        updated.push(key);
      },
    } as never);
    expect(updated).toEqual([]);
    const manager = rows.find((row) => row.key === 'itam-asset-manager');
    expect(
      (manager?.grants ?? []).some(
        (grant) => grant.resource.id === 'main.disposals',
      ),
    ).toBe(true);
    // Configuring this application belongs to the Asset Manager, since the
    // platform's administrator holds nothing of ours.
    expect(
      (manager?.grants ?? [])
        .find(
          (grant) =>
            grant.resource.type === 'settings' &&
            grant.resource.id === 'itam.settings',
        )
        ?.actions.map((action) => action.action)
        .sort(),
    ).toEqual(['read', 'update']);
  });

  it('rewrites a Collection grant written in the pre-beta.43 field shape', async () => {
    const stored = [
      {
        key: 'legacy',
        grants: [
          {
            resource: { type: 'database.collection', id: 'main.models' },
            actions: [
              {
                action: 'read',
                policy: {
                  type: 'database',
                  fields: { output: ['id', 'name'] },
                  recordAccess: ['allRecords'],
                },
              },
              {
                action: 'update',
                policy: {
                  type: 'database',
                  fields: { input: ['name'], output: '*' },
                  recordAccess: ['allRecords'],
                },
              },
              {
                action: 'delete',
                policy: {
                  type: 'database',
                  fields: { input: '*', output: '*' },
                  recordAccess: ['allRecords'],
                },
              },
            ],
          },
        ],
      },
    ];
    const updated: { key: string; grants: unknown }[] = [];
    await reconcileGrants({
      list: async () => stored,
      update: async (key: string, set: { grants: unknown }) => {
        updated.push({ key, grants: set.grants });
      },
    } as never);
    expect(updated).toEqual([
      {
        key: 'legacy',
        grants: [
          {
            resource: { type: 'database.collection', id: 'main.models' },
            actions: [
              {
                action: 'read',
                policy: {
                  type: 'database',
                  fields: ['id', 'name'],
                  recordAccess: ['allRecords'],
                },
              },
              {
                action: 'update',
                policy: {
                  type: 'database',
                  fields: ['name'],
                  recordAccess: ['allRecords'],
                },
              },
              {
                action: 'delete',
                policy: { type: 'database', recordAccess: ['allRecords'] },
              },
            ],
          },
        ],
      },
    ]);
  });

  it('strips operations and resources the application no longer declares', async () => {
    const grant = (actions: readonly string[], id = 'itam.entitlements') => ({
      resource: { type: 'composite', id },
      actions: actions.map((action) => ({ action })),
    });
    const updated: {
      key: string;
      grants: readonly ReturnType<typeof grant>[];
    }[] = [];
    await reconcileGrants({
      list: async () => [
        {
          key: 'manager',
          grants: [
            grant(['assignSeat', 'importUsage', 'recordBill']),
            // The P4 seed still turns the removed tickets grant into this.
            grant(['accept', 'close'], 'itam.tickets'),
          ],
        },
        { key: 'usage-only', grants: [grant(['importUsage'])] },
        { key: 'untouched', grants: [grant(['assignSeat'])] },
      ],
      update: async (
        key: string,
        set: { grants: readonly ReturnType<typeof grant>[] },
      ) => {
        updated.push({ key, grants: set.grants });
      },
    } as never);
    expect(updated).toEqual([
      { key: 'manager', grants: [grant(['assignSeat'])] },
      { key: 'usage-only', grants: [] },
    ]);
  });
});
