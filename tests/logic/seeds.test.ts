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
    // An English deployment's first employee has an English name.
    const person = await query
      .selectFrom('people')
      .select(['name', 'email'])
      .where('id', '=', 'person-li-xiao')
      .executeTakeFirstOrThrow();
    expect(person).toEqual({
      name: 'James Walker',
      email: 'james.walker@example.com',
    });

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
    // Written in the deployment's language. The kits are data now
    // (入职配置), so the notes point there instead of listing them again.
    expect(ai.builtInEmployeesDisabled).toBe(true);
    expect(ai.businessNotes.startsWith('## ')).toBe(true);
    expect(ai.businessNotes).toContain('Onboarding kits');
    expect(ai.businessNotes).not.toContain('MacBook Pro 14 M3');
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

    // The seeds grant nothing the application no longer has — no tickets,
    // contracts or bills — so a data reset leaves nothing for the startup
    // step to strip. The merged entitlements collection is granted directly.
    for (const row of rows)
      expect(
        row.grants
          .map((grant) => grant.resource.id)
          .filter((id) => /ticket|contract|Bills/.test(id)),
      ).toEqual([]);
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

  it("removes the Employee set and renames a request's requester in stored lists", async () => {
    const stored = [
      {
        key: 'itam-employee',
        grants: [
          {
            resource: { type: 'page', id: 'my-assets' },
            actions: [{ action: 'access' }],
          },
        ],
      },
      {
        key: 'custom',
        grants: [
          {
            resource: { type: 'page', id: 'my-assets' },
            actions: [{ action: 'access' }],
          },
          {
            resource: { type: 'database.collection', id: 'main.disposals' },
            actions: [
              {
                action: 'read',
                policy: {
                  type: 'database',
                  fields: ['id', 'requesterId', 'status'],
                  recordAccess: ['allRecords'],
                },
              },
            ],
          },
        ],
      },
    ];
    const revoked: string[] = [];
    const deleted: string[] = [];
    const updated: { key: string; grants: unknown }[] = [];
    await reconcileGrants({
      list: async () => stored,
      listAssignments: async (key: string) =>
        key === 'itam-employee'
          ? [
              {
                id: 'a1',
                permissionSet: key,
                subject: { type: 'user', id: 'u' },
              },
            ]
          : [],
      revoke: async (id: string) => {
        revoked.push(id);
      },
      delete: async (key: string) => {
        deleted.push(key);
      },
      update: async (key: string, set: { grants: unknown }) => {
        updated.push({ key, grants: set.grants });
      },
    } as never);
    expect(revoked).toEqual(['a1']);
    expect(deleted).toEqual(['itam-employee']);
    // 我的资产 went with the role, and 申请人 became 负责人.
    expect(updated).toEqual([
      {
        key: 'custom',
        grants: [
          {
            resource: { type: 'database.collection', id: 'main.disposals' },
            actions: [
              {
                action: 'read',
                policy: {
                  type: 'database',
                  // The disposal's data-wipe answer is topped up as well.
                  fields: ['id', 'ownerId', 'status', 'dataWipe', 'wipeMethod'],
                  recordAccess: ['allRecords'],
                },
              },
            ],
          },
        ],
      },
    ]);
  });

  it('rewrites a Collection grant written in the pre-beta.43 field shape', async () => {
    const stored = [
      {
        key: 'legacy',
        grants: [
          {
            resource: { type: 'database.collection', id: 'main.vendors' },
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
            resource: { type: 'database.collection', id: 'main.vendors' },
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

  /**
   * `itam.myAudits` narrowed IT support to the stocktakes naming them and is
   * no longer registered, so a stored grant naming it would point at a scope
   * nobody resolves. Both shapes a grant stores a scope in are rewritten to
   * every record, which is what IT support now holds; any other scope is
   * left alone.
   */
  it('retires the myAudits record scope in both stored shapes', async () => {
    const stored = [
      {
        key: 'itam-it-support',
        grants: [
          {
            resource: { type: 'database.collection', id: 'main.auditTasks' },
            actions: [
              {
                action: 'read',
                policy: {
                  type: 'database',
                  fields: '*',
                  recordAccess: ['itam.myAudits'],
                },
              },
            ],
          },
          {
            resource: { type: 'composite', id: 'itam.auditTasks' },
            actions: [
              {
                action: 'count',
                policy: {
                  type: 'composite',
                  scopes: { auditTasks: 'itam.myAudits' },
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
    const json = JSON.stringify(updated);
    expect(json).not.toContain('itam.myAudits');
    expect(updated[0]?.grants).toEqual(
      expect.arrayContaining([
        {
          resource: { type: 'database.collection', id: 'main.auditTasks' },
          actions: [
            {
              action: 'read',
              policy: {
                type: 'database',
                fields: '*',
                recordAccess: ['allRecords'],
              },
            },
          ],
        },
        {
          resource: { type: 'composite', id: 'itam.auditTasks' },
          actions: [
            {
              action: 'count',
              policy: {
                type: 'composite',
                scopes: { auditTasks: 'allRecords' },
              },
            },
          ],
        },
      ]),
    );
  });

  it('gives a set stored before 入职配置 its grant, and no page of its own', async () => {
    const stored = [
      { key: 'itam-it-support', grants: [] },
      { key: 'itam-asset-manager', grants: [] },
    ];
    const updated = new Map<string, unknown[]>();
    await reconcileGrants({
      list: async () => stored,
      update: async (key: string, set: { grants: unknown[] }) => {
        updated.set(key, set.grants);
      },
    } as never);
    const kitGrant = (key: string) =>
      (
        updated.get(key) as
          | { resource: { id: string }; actions: { action: string }[] }[]
          | undefined
      )?.find((grant) => grant.resource.id === 'main.onboardingKits');
    // IT support keeps them; only the manager may delete one.
    expect(kitGrant('itam-it-support')?.actions.map((a) => a.action)).toEqual([
      'read',
      'create',
      'update',
    ]);
    expect(kitGrant('itam-asset-manager')?.actions.map((a) => a.action)).toEqual(
      ['read', 'create', 'update', 'delete'],
    );
    // 入职配置 is a tab of the department's page since 2026-10-06, so its
    // page of its own is not added, and a stored grant for it is stripped.
    expect(updated.get('itam-it-support')).not.toContainEqual({
      resource: { type: 'page', id: 'onboarding-kits' },
      actions: [{ action: 'access' }],
    });
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
