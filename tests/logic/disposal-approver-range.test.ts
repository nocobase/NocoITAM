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

import {
  approverDirectoryToken,
  createApproverDirectory,
  startApproverRange,
  type ApproverDirectory,
} from '../../server/providers/itam/approvers.js';
import { createItamLifecycleRuntime } from '../../server/providers/itam/lifecycles.js';
import { userDirectoryRoutes } from '../../server/routes/itam/users.js';
import {
  createTestDatabase,
  type TestDatabase,
} from '../support/test-database.js';

// 设置 → 报废流程's approver range (2026-10-18): whom a submitter may ask to
// approve a disposal, kept as a lifecycle parameter. It narrows the people
// who hold disposal approval and never widens them; saving it is versioned,
// so a stale page conflicts and a resent request saves nothing twice.

const USERS = [
  { id: 'mia', name: 'Mia' },
  { id: 'ann', name: 'Ann' },
  { id: 'sam', name: 'Sam' },
];

const approve = {
  resource: { type: 'composite', id: 'itam.disposals' },
  actions: [{ action: 'approve' }],
};
const SETS = [
  { key: 'itam-asset-manager', title: 'IT Asset Manager', grants: [approve] },
  { key: 'finance', title: 'Finance', grants: [approve] },
  // Holds an operation of this application's, but not the approval.
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
];
const ASSIGNMENTS: Readonly<Record<string, readonly string[]>> = {
  'itam-asset-manager': ['mia'],
  finance: ['ann'],
  'itam-it-support': ['sam'],
};

describe('disposal approver range', () => {
  let db: TestDatabase;
  let container: ServiceContainer;
  let directory: ApproverDirectory;
  let root: Hono;

  beforeEach(async () => {
    db = await createTestDatabase();
    container = new ServiceContainer();
    container.instance(databaseManagerToken, db.database);
    container.instance(authenticationToken, {
      required: () => (async (_context, next) => next()) as MiddlewareHandler,
    } as never);
    container.instance(authorizationToken, {
      permissionSets: {
        list: async () => SETS,
        listAssignments: async (key: string) =>
          (ASSIGNMENTS[key] ?? []).map((id) => ({
            subject: { type: 'user', id },
          })),
      },
    } as never);
    container.instance(userAdministrationServiceToken, {
      list: async (input: { userIds?: readonly string[] }) => {
        const items = USERS.filter(
          (user) => !input.userIds || input.userIds.includes(user.id),
        );
        return { items, total: items.length, page: 1, pageSize: 100 };
      },
    } as never);
    const runtime = createItamLifecycleRuntime({
      database: db.database,
      approvals: { forSubject: async () => [] } as never,
      notifier: { notify: async () => {}, deliver: async () => {} },
    });
    directory = createApproverDirectory(container, () => runtime);
    container.instance(approverDirectoryToken, directory);
    root = new Hono();
    root.route(
      '/api',
      await userDirectoryRoutes.createRouter({
        container,
      } as unknown as Application),
    );
  });

  afterEach(async () => {
    await db.destroy();
  });

  const ids = (people: readonly { id: string }[]) =>
    people.map((person) => person.id).sort();
  const save = (input: {
    anyone?: boolean;
    roles?: string[];
    users?: string[];
    revision: number;
    requestId: string;
  }) =>
    directory.saveApproverRange(
      { anyone: false, roles: [], users: [], ...input },
      'mia',
    );

  it('is everyone who may approve until an administrator narrows it', async () => {
    const view = await directory.approverRangeView();
    expect(view).toMatchObject({
      anyone: true,
      roles: [],
      users: [],
      revision: 0,
      updatedById: null,
    });
    expect(ids(view.approvers)).toEqual(['ann', 'mia']);
    // What may be chosen: the sets and people holding the approval.
    expect(view.roleOptions.map((role) => role.key).sort()).toEqual([
      'finance',
      'itam-asset-manager',
    ]);
    expect(ids(view.userOptions)).toEqual(['ann', 'mia']);
    expect(await directory.mayApproveDisposal('sam')).toBe(true);
  });

  it('narrows the picker and the submission to the sets and people chosen', async () => {
    const saved = await save({
      roles: ['finance'],
      revision: 0,
      requestId: 'r1',
    });
    expect(saved).toMatchObject({
      anyone: false,
      roles: ['finance'],
      revision: 1,
      updatedById: 'mia',
    });
    expect(ids(saved.approvers)).toEqual(['ann']);
    expect(await directory.mayApproveDisposal('ann')).toBe(true);
    expect(await directory.mayApproveDisposal('mia')).toBe(false);
    // The submitter's picker offers the range alone.
    const response = await root.request(
      '/api/itam/users/approvers?filter[subject]=disposal',
    );
    const { data } = (await response.json()) as { data: { id: string }[] };
    expect(ids(data)).toEqual(['ann']);
    // A purchase order's approvers are not the disposals' range.
    const orders = await root.request(
      '/api/itam/users/approvers?filter[subject]=purchaseOrder',
    );
    expect(((await orders.json()) as { data: unknown[] }).data).toEqual([]);
  });

  it('conflicts on a stale page and saves a resent request once', async () => {
    await save({ users: ['ann'], revision: 0, requestId: 'r1' });
    // The same request again: the first version, nothing new.
    expect(
      (await save({ users: ['ann'], revision: 0, requestId: 'r1' })).revision,
    ).toBe(1);
    // Another page still showing revision 0.
    await expect(
      save({ users: ['mia'], revision: 0, requestId: 'r2' }),
    ).rejects.toMatchObject({ rule: 'CONFLICT' });
    expect(
      (await save({ anyone: true, revision: 1, requestId: 'r3' })).anyone,
    ).toBe(true);
  });

  it('refuses a range that names nobody, someone who may not approve, or an unknown set', async () => {
    await expect(save({ revision: 0, requestId: 'r1' })).rejects.toMatchObject({
      field: 'roles',
    });
    await expect(
      save({ users: ['sam'], revision: 0, requestId: 'r2' }),
    ).rejects.toMatchObject({ field: 'users' });
    await expect(
      save({ roles: ['itam-it-support'], revision: 0, requestId: 'r3' }),
    ).rejects.toMatchObject({ field: 'roles' });
    expect((await directory.approverRangeView()).revision).toBe(0);
  });

  it('starts a deployment at the IT Asset Manager set, once, and never over a saved range', async () => {
    await startApproverRange(container);
    const started = await directory.approverRangeView();
    expect(started).toMatchObject({
      anyone: false,
      roles: ['itam-asset-manager'],
      revision: 1,
      updatedById: 'system',
    });
    expect(ids(started.approvers)).toEqual(['mia']);
    // The next start finds it saved.
    await startApproverRange(container);
    expect((await directory.approverRangeView()).revision).toBe(1);
    // An administrator's choice stands through every later start.
    await save({ anyone: true, revision: 1, requestId: 'r1' });
    await startApproverRange(container);
    expect((await directory.approverRangeView()).anyone).toBe(true);
  });
});
