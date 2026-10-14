// @vitest-environment node
import { databaseManagerToken } from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import migration from '../../database/main/migrations/202610140001_device_sync.js';
import {
  configuredSources,
  createIntuneSource,
  normalizeSerial,
  SourceError,
  type DeviceSource,
  type ObservedDevice,
} from '../../server/providers/itam/device-sources.js';
import {
  createDeviceSyncService,
  deviceSyncServiceToken,
  type DeviceSyncService,
} from '../../server/providers/itam/device-sync.js';
import { historyServiceToken } from '../../server/providers/itam/history.js';
import { deviceRoutes } from '../../server/routes/itam/devices.js';
import { deviceSyncRoutes } from '../../server/routes/itam/device-sync.js';
import { masterDataRoutes } from '../../server/routes/itam/master-data.js';
import { createTestDatabase, schemaClient } from '../support/test-database.js';
import { createTestApp, json, type TestApp } from '../support/test-app.js';

const manager = { user: 'mia', role: 'manager' as const };
const support = { user: 'sam', role: 'support' as const };
const employee = { user: 'eve', role: 'employee' as const };

/** An Intune record as ITAM reads it, with the fields a test cares about. */
const observed = (
  externalId: string,
  overrides: Partial<ObservedDevice> = {},
): ObservedDevice => ({
  externalId,
  serialNo: null,
  deviceName: `PC-${externalId}`,
  manufacturer: 'Lenovo',
  model: 'ThinkPad T14 Gen 5',
  osName: 'Windows',
  osVersion: '10.0.22631',
  userPrincipal: null,
  userName: null,
  ownership: 'company',
  compliance: 'compliant',
  encrypted: true,
  wifiMac: null,
  enrolledAt: '2026-01-05T08:00:00Z',
  lastSyncAt: '2026-10-13T22:10:00Z',
  raw: { id: externalId },
  ...overrides,
});

async function* pagesOf(
  ...pages: readonly (readonly ObservedDevice[])[]
): AsyncIterable<readonly ObservedDevice[]> {
  for (const page of pages) yield page;
}

describe('device sync', () => {
  let app: TestApp;
  let sync: DeviceSyncService;
  const query = () => app.container.resolve(databaseManagerToken).query();
  const created = async (path: string, body: Record<string, unknown>) => {
    const response = await app.request(`/api/itam/${path}`, {
      ...json(body),
      ...manager,
    });
    if (response.status !== 201)
      throw new Error(`${path}: ${await response.text()}`);
    return ((await response.json()) as { data: { id: string } }).data.id;
  };
  const device = (serialNo: string, modelId = 'model-thinkpad-t14-gen5') =>
    created('devices', { modelId, locationId: 'loc-hq', serialNo });
  const managed = async () =>
    (await query()
      .selectFrom('managedDevices')
      .selectAll()
      .orderBy('externalId')
      .execute()) as Record<string, unknown>[];

  beforeEach(async () => {
    app = await createTestApp({ seeds: true });
    for (const routes of [masterDataRoutes, deviceRoutes, deviceSyncRoutes])
      await app.mount(routes);
    sync = app.container.resolve(deviceSyncServiceToken);
  });

  afterEach(async () => {
    await app.destroy();
  });

  it('links a device by its serial, ignoring case and spaces, and says so on its timeline', async () => {
    const laptop = await device('pf4abc12');
    const run = await sync.ingest(
      'intune',
      pagesOf([observed('a', { serialNo: '  PF4ABC12 ' })]),
      'manual',
      'mia',
    );
    expect(run).toMatchObject({
      status: 'succeeded',
      seen: 1,
      added: 1,
      linked: 1,
      gone: 0,
      actorId: 'mia',
    });
    expect(await managed()).toMatchObject([
      {
        externalId: 'a',
        serialNo: 'PF4ABC12',
        deviceId: laptop,
        matchState: 'linked',
        matchedBy: 'serial',
      },
    ]);
    const events = await app.container
      .resolve(historyServiceToken)
      .events({ subjectType: 'devices', subjectId: laptop });
    expect(
      events.data.find((event) => event.type === 'managedLinked'),
    ).toMatchObject({
      origin: 'sync',
      actorId: 'mia',
      payload: { source: 'intune', externalId: 'a', targetLabel: 'PC-a' },
    });

    const views = await sync.forDevice(laptop);
    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({
      source: 'intune',
      deviceName: 'PC-a',
      osName: 'Windows',
      encrypted: true,
    });
    expect(views[0].consoleUrl).toContain('mdmDeviceId/a');
  });

  it('never matches a placeholder serial, and leaves a serial two devices share to a person', async () => {
    await device('DUP-1', 'model-thinkpad-t14-gen5');
    await device('DUP-1', 'model-macbook-pro-14-m3');
    await sync.ingest(
      'intune',
      pagesOf([
        observed('a', { serialNo: 'To be filled by O.E.M.' }),
        observed('b', { serialNo: '0000-0000-0000' }),
        observed('c', { serialNo: 'dup-1' }),
        observed('d', { serialNo: 'NOT-ON-THE-BOOKS' }),
      ]),
      'manual',
    );
    expect(
      (await managed()).map((row) => [
        row.externalId,
        row.serialNo,
        row.matchState,
        row.deviceId,
      ]),
    ).toEqual([
      ['a', null, 'unlinked', null],
      ['b', null, 'unlinked', null],
      ['c', 'DUP-1', 'ambiguous', null],
      ['d', 'NOT-ON-THE-BOOKS', 'unlinked', null],
    ]);
  });

  it('keeps a link when the serial changes later, and matches the primary user by email', async () => {
    const laptop = await device('SN-ONE');
    const person = await created('master/people', {
      name: 'Pat Lee',
      email: 'Pat.Lee@example.com',
      departmentId: 'dept-rd',
    });
    await sync.ingest(
      'intune',
      pagesOf([observed('a', { serialNo: 'SN-ONE' })]),
      'schedule',
    );
    await sync.ingest(
      'intune',
      pagesOf([
        observed('a', {
          serialNo: 'NEW-BOARD',
          userPrincipal: 'pat.lee@example.com',
        }),
      ]),
      'schedule',
    );
    expect(await managed()).toMatchObject([
      {
        deviceId: laptop,
        matchState: 'linked',
        serialNo: 'NEW-BOARD',
        personId: person,
      },
    ]);
    // Linked once: the second pull found the link already made.
    const events = await app.container
      .resolve(historyServiceToken)
      .events({ subjectType: 'devices', subjectId: laptop });
    expect(
      events.data.filter((event) => event.type === 'managedLinked'),
    ).toHaveLength(1);
  });

  it('marks a device gone only after a pull that read everything', async () => {
    await sync.ingest(
      'intune',
      pagesOf([observed('a'), observed('b')]),
      'schedule',
    );
    // A pull that fails after its first page updates what it read and marks
    // nothing gone.
    async function* broken(): AsyncIterable<readonly ObservedDevice[]> {
      yield [observed('a')];
      throw new SourceError('UNAVAILABLE', 'Graph answered 503');
    }
    const partial = await sync.ingest('intune', broken(), 'schedule');
    expect(partial).toMatchObject({
      status: 'partial',
      seen: 1,
      failureCode: 'UNAVAILABLE',
    });
    expect((await managed()).map((row) => row.goneAt)).toEqual([null, null]);

    const complete = await sync.ingest(
      'intune',
      pagesOf([observed('a')]),
      'schedule',
    );
    expect(complete).toMatchObject({ status: 'succeeded', gone: 1 });
    const [a, b] = await managed();
    expect(a.goneAt).toBeNull();
    expect(b.goneAt).not.toBeNull();

    // Reported again, it is back.
    await sync.ingest(
      'intune',
      pagesOf([observed('a'), observed('b')]),
      'schedule',
    );
    expect((await managed()).map((row) => row.goneAt)).toEqual([null, null]);
  });

  it('records a pull that could not sign in as failed, with its reason', async () => {
    // A platform that refuses the sign-in fails before its first page.
    const refused: AsyncIterable<readonly ObservedDevice[]> = {
      [Symbol.asyncIterator]: () => ({
        next: () =>
          Promise.reject(
            new SourceError('AUTH_FAILED', 'Invalid client secret'),
          ),
      }),
    };
    const run = await sync.ingest('intune', refused, 'schedule');
    expect(run).toMatchObject({
      status: 'failed',
      failureCode: 'AUTH_FAILED',
      failure: 'Invalid client secret',
      seen: 0,
    });
  });

  it('counts each source for the settings page, personal devices apart', async () => {
    await device('LINK-ME');
    await sync.ingest(
      'intune',
      pagesOf([
        observed('a', { serialNo: 'LINK-ME' }),
        observed('b'),
        observed('c', { ownership: 'personal' }),
      ]),
      'manual',
    );
    const [intune] = await sync.status();
    expect(intune).toMatchObject({
      key: 'intune',
      configured: false,
      running: false,
      counts: {
        devices: 3,
        linked: 1,
        unlinked: 1,
        ambiguous: 0,
        personal: 1,
        gone: 0,
      },
    });
    expect(intune.lastRun).toMatchObject({ status: 'succeeded' });
    expect(intune.lastSuccessAt).not.toBeNull();
  });

  it('starts a pull of each configured source and lets a second request join it', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const source: DeviceSource = {
      key: 'intune',
      async *pages() {
        await gate;
        yield [observed('a')];
      },
    };
    const service = createDeviceSyncService({
      database: app.container.resolve(databaseManagerToken),
      history: app.container.resolve(historyServiceToken),
      sources: () => [source],
    });
    const first = await service.start('manual', 'mia');
    expect(first).toEqual([expect.objectContaining({ status: 'running' })]);
    const second = await service.start('manual', 'mia');
    expect(second[0].id).toBe(first[0].id);
    expect((await service.status())[0].running).toBe(true);
    release();
    const [done] = await service.runAll('manual');
    expect(done).toMatchObject({ id: first[0].id, status: 'succeeded' });
  });

  describe('routes', () => {
    it('shows sync status and starts a pull only to a holder of the settings grant', async () => {
      expect((await app.request('/api/itam/device-sync')).status).toBe(401);
      // IT support holds the settings grant, as the seeded role does.
      expect(
        (await app.request('/api/itam/device-sync', { ...support })).status,
      ).toBe(200);
      expect(
        (await app.request('/api/itam/device-sync', { ...employee })).status,
      ).toBe(403);
      const status = await app.request('/api/itam/device-sync', {
        ...manager,
      });
      expect(status.status).toBe(200);
      expect(
        ((await status.json()) as { data: { key: string }[] }).data.map(
          (source) => source.key,
        ),
      ).toEqual(['intune']);
      expect(
        (
          await app.request('/api/itam/device-sync/run', {
            ...json({}),
            ...employee,
          })
        ).status,
      ).toBe(403);
      // The test application connects no platform.
      const run = await app.request('/api/itam/device-sync/run', {
        ...json({}),
        ...manager,
      });
      expect(run.status).toBe(422);
      expect(await run.json()).toMatchObject({
        rule: 'deviceSync.notConfigured',
      });
    });

    it("answers a device's platform records to whoever may read the device", async () => {
      const laptop = await device('ROUTE-1');
      await sync.ingest(
        'intune',
        pagesOf([observed('r', { serialNo: 'ROUTE-1' })]),
        'manual',
      );
      expect(
        (await app.request(`/api/itam/devices/${laptop}/managed`)).status,
      ).toBe(401);
      const response = await app.request(
        `/api/itam/devices/${laptop}/managed`,
        { ...support },
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        data: [{ externalId: 'r', source: 'intune' }],
        connected: true,
      });
      expect(
        (
          await app.request('/api/itam/devices/no-such-device/managed', {
            ...manager,
          })
        ).status,
      ).toBe(404);
    });
  });
});

describe('device sources', () => {
  it('reads a serial as matched, dropping placeholders', () => {
    expect(normalizeSerial(' c02xl0abc1 ')).toBe('C02XL0ABC1');
    expect(normalizeSerial('Default string')).toBeNull();
    expect(normalizeSerial('000000')).toBeNull();
    expect(normalizeSerial('')).toBeNull();
    expect(normalizeSerial(null)).toBeNull();
  });

  it('connects Intune only when config.yml has all three values', () => {
    expect(configuredSources(undefined)).toEqual([]);
    expect(
      configuredSources({ intune: { tenantId: 't', clientId: 'c' } }),
    ).toEqual([]);
    expect(
      configuredSources({
        intune: { tenantId: 't', clientId: 'c', clientSecret: 's' },
      }).map((source) => source.key),
    ).toEqual(['intune']);
  });

  const config = {
    tenantId: 'tenant',
    clientId: 'client',
    clientSecret: 'secret',
  };
  const reply = (status: number, body: unknown, headers = {}) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...headers },
    });
  const collect = async (source: DeviceSource) => {
    const pages: (readonly ObservedDevice[])[] = [];
    for await (const page of source.pages()) pages.push(page);
    return pages;
  };

  it('reads Intune page by page through Graph, retrying what is transient', async () => {
    const requests: string[] = [];
    const sleeps: number[] = [];
    const answers = [
      reply(200, { access_token: 'token' }),
      reply(429, {}, { 'retry-after': '2' }),
      reply(200, {
        value: [
          {
            id: 'd1',
            deviceName: 'LAPTOP-1',
            serialNumber: 'PF1',
            managedDeviceOwnerType: 'company',
            userPrincipalName: 'pat@example.com',
            enrolledDateTime: '0001-01-01T00:00:00Z',
            lastSyncDateTime: '2026-10-13T22:10:00Z',
            isEncrypted: false,
          },
        ],
        '@odata.nextLink': 'https://graph.microsoft.com/v1.0/next-page',
      }),
      reply(200, {
        value: [{ id: 'd2', managedDeviceOwnerType: 'personal' }],
      }),
    ];
    const source = createIntuneSource(config, {
      fetch: async (url, init) => {
        requests.push(`${init?.method ?? 'GET'} ${url}`);
        if (url.includes('/next-page') || url.includes('managedDevices'))
          expect((init?.headers as Record<string, string>).authorization).toBe(
            'Bearer token',
          );
        const answer = answers.shift();
        if (!answer) throw new Error('unexpected request');
        return answer;
      },
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      },
    });
    const pages = await collect(source);
    expect(requests[0]).toBe(
      'POST https://login.microsoftonline.com/tenant/oauth2/v2.0/token',
    );
    expect(requests[1]).toMatch(
      /^GET https:\/\/graph\.microsoft\.com\/v1\.0\/deviceManagement\/managedDevices\?\$select=id,/,
    );
    expect(sleeps).toEqual([2000]);
    expect(pages).toHaveLength(2);
    expect(pages[0][0]).toMatchObject({
      externalId: 'd1',
      deviceName: 'LAPTOP-1',
      serialNo: 'PF1',
      ownership: 'company',
      userPrincipal: 'pat@example.com',
      enrolledAt: null,
      lastSyncAt: '2026-10-13T22:10:00Z',
      encrypted: false,
    });
    expect(pages[1][0]).toMatchObject({
      externalId: 'd2',
      ownership: 'personal',
    });
  });

  it('names a refused sign-in and a missing permission', async () => {
    const signIn = createIntuneSource(config, {
      fetch: async () =>
        reply(401, {
          error: 'invalid_client',
          error_description:
            'AADSTS7000215: Invalid client secret provided.\nTrace ID: x',
        }),
    });
    await expect(collect(signIn)).rejects.toMatchObject({
      code: 'AUTH_FAILED',
      message: 'AADSTS7000215: Invalid client secret provided.',
    });

    const answers = [
      reply(200, { access_token: 'token' }),
      reply(403, { error: { message: 'Application is not authorized' } }),
    ];
    const permission = createIntuneSource(config, {
      fetch: async () => answers.shift()!,
    });
    await expect(collect(permission)).rejects.toMatchObject({
      code: 'PERMISSION_MISSING',
      message: 'Application is not authorized',
    });
  });

  it('gives up as unavailable after three failed attempts', async () => {
    let calls = 0;
    const source = createIntuneSource(config, {
      fetch: async () => {
        calls++;
        throw new TypeError('fetch failed');
      },
      sleep: async () => undefined,
    });
    await expect(collect(source)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    expect(calls).toBe(3);
  });
});

describe('device sync migration', () => {
  it('creates both tables on up and drops them on down', async () => {
    const db = await createTestDatabase();
    try {
      const client = await schemaClient(db.database);
      const connection = db.database.connection();
      const context = {
        connection,
        query: connection.query,
        builder: connection.builder,
      };
      expect(await client.schema.hasTable('managed_devices')).toBe(true);
      expect(await client.schema.hasTable('device_sync_runs')).toBe(true);
      await migration.down!(context);
      expect(await client.schema.hasTable('managed_devices')).toBe(false);
      expect(await client.schema.hasTable('device_sync_runs')).toBe(false);
      await migration.up(context);
      expect(await client.schema.hasTable('managed_devices')).toBe(true);
      expect(
        await client.schema.hasColumn('managed_devices', 'external_id'),
      ).toBe(true);
    } finally {
      await db.destroy();
    }
  });
});
