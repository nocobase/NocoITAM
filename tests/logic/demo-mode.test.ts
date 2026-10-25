// @vitest-environment node
import { expect, vi } from 'vitest';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { demoServiceToken } from '../../server/providers/itam/demo.js';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { demoDataToken } from '@nocobase/app-plugin-demo-mode/server/tokens';
import { createStandaloneServer } from '../../server/standalone.js';

const test = createAppTest({
  createServer: createStandaloneServer,
  connections: ['main'],
  config: {
    app: { publicOrigin: 'http://localhost' },
    auth: { secret: 'test-auth-secret-at-least-32-characters' },
    secrets: { keys: [{ version: 1, key: 'a'.repeat(64) }] },
    notification: { channels: { 'in-app': { provider: 'in-app' } } },
    demoMode: { enabled: true },
  },
});

// Three full datasets are generated through business services, including on busy CI hosts.
test('demo permits browsing, refuses writes, and resets the existing ITAM story through the plugin', async ({
  testApp,
  request,
  connection,
}) => {
  expect(await (await request('/demoMode/status')).json()).toEqual({
    data: { enabled: true },
  });
  expect((await request('/itam/devices')).status).toBe(401);
  // beta.3 offers existing accounts before any dataset has been generated.
  const initialAccounts = await (await request('/demoMode/accounts')).json();
  expect(initialAccounts.data).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ username: DEFAULT_ADMIN_CREDENTIALS.username }),
    ]),
  );
  const quickEntry = await request('/demoMode/accounts/signInDefault', {
    method: 'POST',
  });
  expect(quickEntry.status).toBe(200);
  expect(await quickEntry.json()).toMatchObject({ data: { signedIn: true } });
  expect(quickEntry.headers.getSetCookie().length).toBeGreaterThan(0);
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const session = await (await admin.fetch('/auth/get-session')).json();
  const actorId = String(session.user.id);
  const data = testApp.application.container.resolve(demoDataToken);
  const generated = await data.importNow(actorId, 'en-US');
  expect(generated.failure).toBeNull();
  expect(generated.present).toBe(true);
  expect(generated.counts.devices).toBeGreaterThan(50);
  const accounts = await (await request('/demoMode/accounts')).json();
  expect(
    accounts.data
      .map((account: { username: string }) => account.username)
      .sort(),
  ).toEqual(
    [DEFAULT_ADMIN_CREDENTIALS.username, 'daniel', 'emily', 'ryanm'].sort(),
  );

  for (const path of [
    '/itam/settings',
    '/itam/devices',
    '/itam/workbench/my-work',
    '/demoMode/data',
    '/demoMode/configuration',
  ]) {
    const response = await admin.fetch(path);
    expect(response.status, `${path}: ${await response.text()}`).toBe(200);
  }
  // beta.1 enables integrated chat by default. ITAM still refuses its
  // mutation/real-effect entry points, and has no business write exceptions.
  const configuration = await (
    await admin.fetch('/demoMode/configuration')
  ).json();
  expect(configuration.data.chat.enabled).toBe(true);
  expect(configuration.data.collections).toEqual([]);
  expect(configuration.data.schedule).toMatchObject({
    enabled: true,
    hour: 3,
    minute: 0,
    timezone: 'UTC',
    language: 'en-US',
  });
  const device = await connection.query
    .selectFrom('devices')
    .select(['id', 'name'])
    .executeTakeFirstOrThrow();
  for (const [method, path, body] of [
    ['POST', '/itam/devices', {}],
    ['PATCH', `/itam/devices/${device.id}`, { name: 'Not saved' }],
    ['DELETE', `/itam/devices/${device.id}`, {}],
    ['POST', '/itam/demo/generate', {}],
    ['POST', '/agents/conversations', {}],
  ] as const) {
    const response = await admin.fetch(path, {
      method,
      headers: {
        'content-type': 'application/json',
        'accept-language': 'zh-CN',
      },
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { reason: 'DEMO_READ_ONLY' },
    });
  }
  expect(
    await connection.query
      .selectFrom('devices')
      .select('name')
      .where('id', '=', device.id)
      .executeTakeFirstOrThrow(),
  ).toEqual({ name: device.name });
  // An untracked business record must also disappear on a dedicated demo reset.
  await connection.query
    .insertInto('vendors')
    .values({
      id: 'visitor-vendor',
      name: 'Visitor vendor',
      types: ['reseller'],
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .execute();
  const permissionSets =
    testApp.application.container.resolve(authorizationToken).permissionSets;
  expect(
    (await permissionSets.list()).some(
      (set) => set.key === 'itam-demo-administrator',
    ),
  ).toBe(false);
  const importerGrant = (await permissionSets.listAssignments()).find(
    (assignment) =>
      assignment.subject.type === 'user' &&
      String(assignment.subject.id) === actorId &&
      assignment.permissionSet === 'itam-asset-manager',
  );
  expect(importerGrant).toBeDefined();
  // Older imports can track the executing administrator's business grant.
  await connection.query
    .insertInto('demoRecords')
    .values({
      collection: 'importerGrants',
      recordId: String(importerGrant!.id),
      createdAt: new Date(),
    })
    .execute();
  const reset = await data.reset(actorId, 'en-US', { wait: true });
  expect(
    (await permissionSets.listAssignments()).some(
      (assignment) => assignment.id === importerGrant!.id,
    ),
  ).toBe(true);
  expect(reset.failure).toBeNull();
  expect(reset.present).toBe(true);
  expect(reset.counts.devices).toBe(generated.counts.devices);
  expect(
    await connection.query
      .selectFrom('vendors')
      .select('id')
      .where('id', '=', 'visitor-vendor')
      .executeTakeFirst(),
  ).toBeUndefined();
  const visitor = await signIn(testApp, {
    username: 'daniel',
    password: 'daniel123',
  });
  const visitorBefore = await (await visitor.fetch('/auth/get-session')).json();
  expect(
    (
      await visitor.fetch('/demoMode/accounts/signInDefault', {
        method: 'POST',
        headers: { Origin: 'http://localhost' },
      })
    ).status,
  ).toBe(200);
  expect(
    (await (await visitor.fetch('/auth/get-session')).json()).user.id,
  ).toBe(visitorBefore.user.id);
  expect((await visitor.fetch('/itam/devices')).status).toBe(200);
  expect((await visitor.fetch('/demoMode/configuration')).status).toBe(403);
  const assignments = () =>
    permissionSets
      .listAssignments()
      .then((rows) =>
        rows.filter(
          (assignment) =>
            assignment.subject.type === 'user' &&
            String(assignment.subject.id) === actorId,
        ),
      );
  const beforeClear = await assignments();
  expect(beforeClear.length).toBeGreaterThan(0);
  // Demo management uses the existing installation administrator throughout.
  await data.clear(actorId);
  expect(await assignments()).toEqual(beforeClear);
  expect((await (await admin.fetch('/auth/get-session')).json()).user.id).toBe(
    actorId,
  );
  const retained = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  expect(
    (await (await retained.fetch('/auth/get-session')).json()).user.id,
  ).toBe(actorId);
  expect((await data.status()).present).toBe(false);
  const afterClear = await (await request('/demoMode/accounts')).json();
  expect(
    afterClear.data
      .map((account: { username: string }) => account.username)
      .sort(),
  ).toEqual([DEFAULT_ADMIN_CREDENTIALS.username]);
  expect(
    (
      await request(
        `/demoMode/accounts/${DEFAULT_ADMIN_CREDENTIALS.username}/signIn`,
        { method: 'POST' },
      )
    ).status,
  ).toBe(200);
  const regenerated = await data.importNow(actorId, 'en-US');
  expect(regenerated.failure).toBeNull();
  expect((await (await admin.fetch('/auth/get-session')).json()).user.id).toBe(
    actorId,
  );
  expect(
    (await (await request('/demoMode/accounts')).json()).data.map(
      (account: { username: string }) => account.username,
    ),
  ).not.toContain('admin');
  const demo = testApp.application.container.resolve(demoServiceToken);
  const failure = vi
    .spyOn(demo, 'generate')
    .mockRejectedValueOnce(new Error('Test import failure'));
  try {
    // Scheduled retries omit actorId and must reuse the recorded actor.
    await expect(
      data.reset(undefined, 'en-US', { wait: true }),
    ).rejects.toThrow('Test import failure');
    expect((await data.status()).failure).not.toBeNull();
    expect((await assignments()).length).toBeGreaterThan(0);
    expect(
      (await (await admin.fetch('/auth/get-session')).json()).user.id,
    ).toBe(actorId);
  } finally {
    failure.mockRestore();
  }
}, 600_000);
