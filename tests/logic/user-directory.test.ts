// @vitest-environment node
import {
  authenticationToken,
  userAdministrationServiceToken,
} from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono, type MiddlewareHandler } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { userDirectoryRoutes } from '../../server/routes/itam/users.js';
import {
  createTestDatabase,
  type TestDatabase,
} from '../support/test-database.js';

const USERS = [
  { id: 'root', name: 'Administrator' },
  { id: 'mia', name: 'Mia', username: 'mia', disabledAt: null },
  { id: 'sam', name: 'Sam' },
  { id: 'lee', name: 'Lee' },
  { id: 'eve', name: 'Eve', username: 'eve', disabledAt: new Date() },
];

/** The sets the seeds create, plus one an administrator made by hand. */
const SETS = [
  {
    key: 'itam-asset-manager',
    title: 'IT Asset Manager',
    grants: [
      {
        resource: { type: 'composite', id: 'itam.devices' },
        actions: [{ action: 'assign' }],
      },
    ],
  },
  {
    key: 'itam-it-support',
    title: 'IT Support',
    grants: [
      {
        resource: { type: 'composite', id: 'itam.repairs' },
        actions: [{ action: 'complete' }],
      },
    ],
  },
  // Reads one Collection and holds no operation of this application's.
  {
    key: 'auditors',
    title: { key: 'Auditors', ns: 'custom' },
    grants: [
      {
        resource: { type: 'database.collection', id: 'main.devices' },
        actions: [{ action: 'read' }],
      },
    ],
  },
];

const ASSIGNMENTS: Readonly<Record<string, readonly string[]>> = {
  'itam-asset-manager': ['mia'],
  'itam-it-support': ['mia', 'sam', 'lee'],
  auditors: ['eve'],
};

describe('user directory', () => {
  let db: TestDatabase;
  let root: Hono;

  beforeEach(async () => {
    db = await createTestDatabase();
    const container = new ServiceContainer();
    container.instance(databaseManagerToken, db.database);
    container.instance(authenticationToken, {
      required: () => (async (_context, next) => next()) as MiddlewareHandler,
    } as never);
    container.instance(authorizationToken, {
      permissionSets: {
        list: async () => SETS,
        listAssignments: async (key: string) =>
          (ASSIGNMENTS[key] ?? []).map((id) => ({
            id: `${key}:${id}`,
            permissionSet: key,
            subject: { type: 'user', id },
          })),
      },
    } as never);
    container.instance(userAdministrationServiceToken, {
      list: async (input: {
        userIds?: readonly string[];
        search?: string;
        pageSize: number;
      }) => {
        const items = USERS.filter(
          (user) => !input.userIds || input.userIds.includes(user.id),
        ).filter(
          (user) =>
            !input.search ||
            user.name.toLowerCase().includes(input.search.toLowerCase()),
        );
        return { items, total: items.length, page: 1, pageSize: 20 };
      },
      get: async (id: string) => USERS.find((user) => user.id === id),
    } as never);
    const app = { container } as unknown as Application;
    root = new Hono();
    root.route('/api', await userDirectoryRoutes.createRouter(app));
    // Lee has left; an account with no person record (Sam) has not.
    await db.database
      .query()
      .insertInto('people')
      .values({
        id: 'person-lee',
        name: 'Lee',
        departmentId: 'dept',
        userId: 'lee',
        employmentStatus: 'left',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .execute();
  });

  afterEach(async () => {
    await db.destroy();
  });

  const names = async (path: string) =>
    (
      (await (await root.request(path)).json()) as {
        data: { name: string }[];
      }
    ).data.map((user) => user.name);

  it('offers the people in IT and nobody else', async () => {
    // Not root, who holds no set of this application's; not an account
    // whose set holds no ITAM operation; not a leaver.
    expect(await names('/api/itam/users')).toEqual(['Mia', 'Sam']);
    expect(await names('/api/itam/users?q=sa')).toEqual(['Sam']);
  });

  it('says which sign-in a user is, and whether it is disabled', async () => {
    // A person's 关联登录用户 reads as the account it is: two people of a
    // name are told apart by username, and a disabled one says so.
    const response = await root.request('/api/itam/users?ids=mia,eve');
    const users = (
      (await response.json()) as {
        data: { id: string; username: string | null; disabled: boolean }[];
      }
    ).data;
    expect(users).toEqual([
      expect.objectContaining({
        id: 'mia',
        name: 'Mia',
        username: 'mia',
        disabled: false,
      }),
      expect.objectContaining({
        id: 'eve',
        name: 'Eve',
        username: 'eve',
        disabled: true,
      }),
    ]);
  });

  it('names the permission sets each person holds', async () => {
    // A picker reads 负责人 and approvers with their roles; only the sets
    // that grant an ITAM operation count, so Eve's auditors set is not one.
    const roles = async (path: string) =>
      Object.fromEntries(
        (
          (await (await root.request(path)).json()) as {
            data: { id: string; roles: { key: string; title: string }[] }[];
          }
        ).data.map((user) => [user.id, user.roles]),
      );
    const manager = { key: 'itam-asset-manager', title: 'IT Asset Manager' };
    const support = { key: 'itam-it-support', title: 'IT Support' };
    expect(await roles('/api/itam/users')).toEqual({
      mia: [manager, support],
      sam: [support],
    });
    expect(await roles('/api/itam/users?ids=eve,root')).toEqual({
      eve: [],
      root: [],
    });
    expect(await roles('/api/itam/users/repair-owners')).toEqual({
      mia: [manager, support],
      sam: [support],
    });
  });

  it('still resolves the name of anybody a record already names', async () => {
    expect(await names('/api/itam/users?ids=root,eve,lee')).toEqual([
      'Administrator',
      'Lee',
      'Eve',
    ]);
  });
});
