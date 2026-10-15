// @vitest-environment node
import { randomBytes } from 'node:crypto';

import {
  createSecretsService,
  secretsServiceToken,
  type SecretsService,
} from '@nocobase/app-server/secrets';
import { databaseManagerToken } from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import migration from '../../database/main/migrations/202610150002_device_sync_connections.js';
import {
  createDeviceConnectionsSecretsStore,
  createDeviceConnectionsService,
  deviceConnectionsServiceToken,
} from '../../server/providers/itam/device-connections.js';
import {
  historyServiceToken,
  type HistoryService,
} from '../../server/providers/itam/history.js';
import { deviceSyncRoutes } from '../../server/routes/itam/device-sync.js';
import { createTestDatabase, schemaClient } from '../support/test-database.js';
import { createTestApp, json, type TestApp } from '../support/test-app.js';

const support = { user: 'sam', role: 'support' as const };
const employee = { user: 'eve', role: 'employee' as const };

const keys = () =>
  createSecretsService({
    keys: [{ version: 1, key: randomBytes(32).toString('hex') }],
  });
const put = (body: unknown) => ({ ...json(body), method: 'PUT' });
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('device sync connections entered on the settings page', () => {
  let app: TestApp;
  let secrets: SecretsService;
  const query = () => app.container.resolve(databaseManagerToken).query();
  const connections = () =>
    app.container.resolve(deviceConnectionsServiceToken);

  beforeEach(async () => {
    app = await createTestApp({ seeds: true });
    secrets = keys();
    app.container.instance(secretsServiceToken, secrets);
    await app.mount(deviceSyncRoutes);
  });

  afterEach(async () => {
    await app.destroy();
  });

  it('is open only to a holder of the settings grant', async () => {
    expect(
      (await app.request('/api/itam/device-sync/connections')).status,
    ).toBe(401);
    expect(
      (await app.request('/api/itam/device-sync/connections', employee)).status,
    ).toBe(403);
    expect(
      (
        await app.request('/api/itam/device-sync/connections/intune', {
          ...put({ tenantId: 't', clientId: 'c', clientSecret: 's' }),
          ...employee,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await app.request('/api/itam/device-sync/connections/intune', {
          method: 'DELETE',
          ...employee,
        })
      ).status,
    ).toBe(403);
    const listed = await app.request('/api/itam/device-sync/connections', {
      ...support,
    });
    expect(listed.status).toBe(200);
    expect(await listed.json()).toEqual({
      data: {
        secretsReady: true,
        connections: [
          expect.objectContaining({ source: 'intune', origin: null }),
          expect.objectContaining({ source: 'jamf', origin: null }),
        ],
      },
    });
  });

  it('seals the secret, never answers it, and connects the platform', async () => {
    const saved = await app.request(
      '/api/itam/device-sync/connections/intune',
      {
        ...put({
          tenantId: ' tenant-1 ',
          clientId: 'client-1',
          clientSecret: 'super-secret-value',
        }),
        ...support,
      },
    );
    expect(saved.status).toBe(200);
    const body = await saved.text();
    expect(body).not.toContain('super-secret-value');
    expect(JSON.parse(body)).toMatchObject({
      data: {
        source: 'intune',
        origin: 'settings',
        tenantId: 'tenant-1',
        clientId: 'client-1',
        updatedById: 'sam',
      },
    });

    const row = await query()
      .selectFrom('deviceSyncConnections')
      .selectAll()
      .executeTakeFirstOrThrow<Record<string, string>>();
    expect(row.clientSecretSealed).not.toContain('super-secret-value');
    expect(
      secrets.open(row.clientSecretSealed, {
        purpose: 'itam/device-sync-client-secret',
        aad: ['intune'],
      }),
    ).toBe('super-secret-value');

    const listed = await app.request('/api/itam/device-sync/connections', {
      ...support,
    });
    expect(await listed.text()).not.toContain('super-secret-value');
    // A pull now reads Intune.
    const status = (await (
      await app.request('/api/itam/device-sync', { ...support })
    ).json()) as { data: { key: string; configured: boolean }[] };
    expect(status.data.find((source) => source.key === 'intune')).toMatchObject(
      { configured: true },
    );
    expect(await connections().effective()).toEqual({
      intune: {
        tenantId: 'tenant-1',
        url: undefined,
        clientId: 'client-1',
        clientSecret: 'super-secret-value',
      },
    });

    // The history says who connected it, never with the secret.
    const events = await app.container
      .resolve(historyServiceToken)
      .events({ subjectType: 'deviceSyncConnections', subjectId: 'intune' });
    expect(events.data).toHaveLength(1);
    expect(events.data[0]).toMatchObject({
      type: 'connectionCreated',
      actorId: 'sam',
      payload: { clientId: 'client-1', secretChanged: true },
    });
    expect(JSON.stringify(events.data)).not.toContain('super-secret-value');
  });

  it('keeps the stored secret when saved again without one', async () => {
    await connections().save('jamf', {
      url: 'https://acme.jamfcloud.com/',
      clientId: 'a',
      clientSecret: 'first',
    });
    await connections().save('jamf', { clientId: 'b' }, 'sam');
    expect((await connections().effective()).jamf).toMatchObject({
      url: 'https://acme.jamfcloud.com',
      clientId: 'b',
      clientSecret: 'first',
    });
    const events = await app.container
      .resolve(historyServiceToken)
      .events({ subjectType: 'deviceSyncConnections', subjectId: 'jamf' });
    expect(events.data.map((event) => event.type).sort()).toEqual([
      'connectionCreated',
      'connectionUpdated',
    ]);
  });

  it('refuses what is incomplete or not an https address', async () => {
    const refused = async (source: string, body: unknown) =>
      (await (
        await app.request(`/api/itam/device-sync/connections/${source}`, {
          ...put(body),
          ...support,
        })
      ).json()) as { message?: string };
    expect(
      await refused('intune', { tenantId: 't', clientId: 'c' }),
    ).toMatchObject({ message: 'The client secret is required' });
    expect(
      await refused('intune', { clientId: 'c', clientSecret: 's' }),
    ).toMatchObject({ message: 'The tenant ID is required' });
    expect(
      await refused('jamf', {
        url: 'http://acme.jamfcloud.com',
        clientId: 'c',
        clientSecret: 's',
      }),
    ).toMatchObject({
      message: 'The Jamf Pro address must start with https://',
    });
    expect(
      (
        await app.request('/api/itam/device-sync/connections/kandji', {
          ...put({ clientId: 'c', clientSecret: 's' }),
          ...support,
        })
      ).status,
    ).toBe(400);
    expect(
      await query()
        .selectFrom('deviceSyncConnections')
        .select('source')
        .execute(),
    ).toEqual([]);
  });

  it('disconnects, leaving what was synced', async () => {
    await connections().save('intune', {
      tenantId: 't',
      clientId: 'c',
      clientSecret: 's',
    });
    const removed = await app.request(
      '/api/itam/device-sync/connections/intune',
      { method: 'DELETE', ...support },
    );
    expect(removed.status).toBe(200);
    expect(await connections().effective()).toEqual({});
    const events = await app.container
      .resolve(historyServiceToken)
      .events({ subjectType: 'deviceSyncConnections', subjectId: 'intune' });
    expect(events.data.map((event) => event.type)).toContain(
      'connectionRemoved',
    );
  });

  it('binds a sealed secret to its platform', async () => {
    await connections().save('intune', {
      tenantId: 't',
      clientId: 'c',
      clientSecret: 's',
    });
    const { clientSecretSealed } = await query()
      .selectFrom('deviceSyncConnections')
      .select('clientSecretSealed')
      .executeTakeFirstOrThrow<{ clientSecretSealed: string }>();
    // A copy pasted into another platform's row does not open there.
    await query()
      .insertInto('deviceSyncConnections')
      .values({
        source: 'jamf',
        url: 'https://acme.jamfcloud.com',
        clientId: 'c',
        clientSecretSealed,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .execute();
    expect(Object.keys(await connections().effective())).toEqual(['intune']);
  });

  it('is counted by secrets status, for a key rotation', async () => {
    await connections().save('intune', {
      tenantId: 't',
      clientId: 'c',
      clientSecret: 's',
    });
    const store = createDeviceConnectionsSecretsStore(() =>
      app.container.resolve(databaseManagerToken).connection(),
    );
    expect(
      await store.status({ secrets, batchSize: 10, dryRun: false }),
    ).toMatchObject({ total: 1, needsReseal: 0 });
  });

  it('answers a connection test without storing anything', async () => {
    // The platform answers from a script: a token and a page, then a
    // refused sign-in.
    const fetches: string[] = [];
    const answers = [
      reply(200, { access_token: 'token' }),
      reply(200, { value: [{ id: 'd1' }, { id: 'd2' }] }),
      reply(401, { error_description: 'AADSTS7000215: Invalid client secret' }),
    ];
    vi.stubGlobal('fetch', async (url: string) => {
      fetches.push(url);
      return answers.shift()!;
    });
    try {
      const test = (clientSecret: string) =>
        app.request('/api/itam/device-sync/connections/intune/test', {
          ...json({ tenantId: 't', clientId: 'c', clientSecret }),
          ...support,
        });
      expect(await (await test('s')).json()).toEqual({
        data: { ok: true, devices: 2 },
      });
      expect(await (await test('wrong')).json()).toEqual({
        data: {
          ok: false,
          failureCode: 'AUTH_FAILED',
          failure: 'AADSTS7000215: Invalid client secret',
        },
      });
    } finally {
      vi.unstubAllGlobals();
    }
    // One attempt each: a token and a page, then the refused token.
    expect(fetches).toHaveLength(3);
    expect(fetches[0]).toContain('login.microsoftonline.com/t/');
    expect(
      await query()
        .selectFrom('deviceSyncConnections')
        .select('source')
        .execute(),
    ).toEqual([]);
  });
});

describe('device sync connections, by config.yml or without secrets keys', () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let history: HistoryService;
  beforeEach(async () => {
    const app = await createTestApp();
    db = app.db;
    history = app.container.resolve(historyServiceToken);
  });

  it('lets config.yml win, read-only, and never shows its secret', async () => {
    const service = createDeviceConnectionsService({
      database: db.database,
      history,
      config: () => ({
        intune: { tenantId: 'cfg', clientId: 'cfg-client', clientSecret: 'x' },
      }),
      secrets: keys,
    });
    expect((await service.describe())[0]).toEqual({
      source: 'intune',
      origin: 'config',
      tenantId: 'cfg',
      url: null,
      clientId: 'cfg-client',
      updatedAt: null,
      updatedById: null,
    });
    await expect(
      service.save('intune', {
        tenantId: 't',
        clientId: 'c',
        clientSecret: 's',
      }),
    ).rejects.toMatchObject({ rule: 'deviceSync.managedByConfig' });
    await expect(service.remove('intune')).rejects.toMatchObject({
      rule: 'deviceSync.managedByConfig',
    });
    expect((await service.effective()).intune?.clientSecret).toBe('x');
  });

  it('stores nothing without secrets keys, and says so', async () => {
    const service = createDeviceConnectionsService({
      database: db.database,
      history,
      config: () => undefined,
      secrets: () => createSecretsService({}),
    });
    expect(service.secretsReady()).toBe(false);
    await expect(
      service.save('intune', {
        tenantId: 't',
        clientId: 'c',
        clientSecret: 's',
      }),
    ).rejects.toMatchObject({ rule: 'deviceSync.secretsNotConfigured' });
  });
});

describe('device sync connections migration', () => {
  it('creates the table on up and drops it on down', async () => {
    const db = await createTestDatabase();
    try {
      const client = await schemaClient(db.database);
      const connection = db.database.connection();
      const context = {
        connection,
        query: connection.query,
        builder: connection.builder,
      };
      expect(await client.schema.hasTable('device_sync_connections')).toBe(
        true,
      );
      await migration.down!(context);
      expect(await client.schema.hasTable('device_sync_connections')).toBe(
        false,
      );
      await migration.up(context);
      expect(
        await client.schema.hasColumn(
          'device_sync_connections',
          'client_secret_sealed',
        ),
      ).toBe(true);
    } finally {
      await db.destroy();
    }
  });
});
