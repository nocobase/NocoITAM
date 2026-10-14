// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ObservedDevice } from '../../server/providers/itam/device-sources.js';
import { deviceSyncServiceToken } from '../../server/providers/itam/device-sync.js';
import { dataRoutes } from '../../server/routes/itam/data.js';
import { deviceRoutes } from '../../server/routes/itam/devices.js';
import { deviceSyncRoutes } from '../../server/routes/itam/device-sync.js';
import { masterDataRoutes } from '../../server/routes/itam/master-data.js';
import { createTestApp, json, type TestApp } from '../support/test-app.js';

const manager = { user: 'mia', role: 'manager' as const };
const employee = { user: 'eve', role: 'employee' as const };
const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
const dateAgo = (days: number) =>
  new Date(Date.now() - days * DAY).toISOString().slice(0, 10);

const observed = (
  externalId: string,
  values: Partial<ObservedDevice>,
): ObservedDevice => ({
  externalId,
  serialNo: null,
  deviceName: externalId,
  manufacturer: 'Lenovo',
  model: 'ThinkPad T14 Gen 5',
  osName: 'Windows',
  osVersion: '10',
  userPrincipal: null,
  userName: null,
  ownership: 'company',
  compliance: null,
  encrypted: null,
  wifiMac: null,
  enrolledAt: null,
  lastSyncAt: ago(1),
  raw: { id: externalId },
  ...values,
});

/**
 * The two places device sync reaches beyond its own page (2026-10-15): the
 * device list's 同步状态 filter and 最后同步 column, and a leaver's 归属 tab.
 */
describe('device sync in the device list and on a leaver', () => {
  let app: TestApp;
  type Who = { user: string; role: 'employee' | 'manager' };
  const request = (
    path: string,
    body?: Record<string, unknown>,
    who: Who = manager,
  ) =>
    app.request(`/api/itam/${path}`, { ...(body ? json(body) : {}), ...who });
  const created = async (path: string, body: Record<string, unknown>) => {
    const response = await request(path, body);
    if (response.status !== 201) throw new Error(await response.text());
    return ((await response.json()) as { data: { id: string } }).data.id;
  };
  const listIds = async (query: string) => {
    const body = (await (await request(`devices?${query}`)).json()) as {
      data: { id: string; lastSyncAt?: string | null }[];
      syncConnected: boolean;
    };
    return body;
  };

  beforeEach(async () => {
    app = await createTestApp({ seeds: true });
    for (const routes of [
      masterDataRoutes,
      deviceRoutes,
      deviceSyncRoutes,
      dataRoutes,
    ])
      await app.mount(routes);
  });

  afterEach(async () => {
    await app.destroy();
  });

  it('says no platform is connected, and adds nothing to the rows', async () => {
    await created('devices', {
      modelId: 'model-thinkpad-t14-gen5',
      locationId: 'loc-hq',
      serialNo: 'ALONE',
    });
    const body = await listIds('pageSize=50');
    expect(body.syncConnected).toBe(false);
    expect(body.data[0]).not.toHaveProperty('lastSyncAt');
  });

  it('narrows the list and its export to a sync state, and says when each synced', async () => {
    const pat = await created('master/people', {
      name: 'Pat Lee',
      email: 'pat@example.com',
      departmentId: 'dept-rd',
    });
    const device = (serialNo: string) =>
      created('devices', {
        modelId: 'model-thinkpad-t14-gen5',
        locationId: 'loc-hq',
        serialNo,
      });
    const onPlatform = await device('ON');
    const silent = await device('SILENT');
    const unmanaged = await device('OFF');
    for (const id of [onPlatform, silent, unmanaged]) {
      const assigned = await request(`devices/${id}/assign`, {
        targetType: 'person',
        targetId: pat,
      });
      expect(assigned.status).toBe(200);
    }
    await app.container.resolve(deviceSyncServiceToken).ingest(
      'intune',
      (async function* () {
        yield [
          observed('on', { serialNo: 'ON', userPrincipal: 'pat@example.com' }),
          observed('silent', {
            serialNo: 'SILENT',
            userPrincipal: 'pat@example.com',
            lastSyncAt: ago(45),
          }),
        ];
      })(),
      'schedule',
    );

    const all = await listIds('pageSize=50');
    expect(all.syncConnected).toBe(true);
    const synced = new Map(all.data.map((row) => [row.id, row.lastSyncAt]));
    expect(synced.get(onPlatform)).not.toBeNull();
    expect(synced.get(unmanaged)).toBeNull();

    const ids = async (state: string) =>
      (await listIds(`pageSize=50&filter[syncState]=${state}`)).data
        .map((row) => row.id)
        .sort();
    expect(await ids('linked')).toEqual([onPlatform, silent].sort());
    expect(await ids('stale')).toEqual([silent]);
    expect(await ids('unmanaged')).toEqual([unmanaged]);
    // Within the other filters, not instead of them.
    expect(
      (
        await listIds(
          'pageSize=50&filter[syncState]=linked&filter[status]=inStock',
        )
      ).data,
    ).toEqual([]);

    const exported = await request(
      'exports/devices?filter[syncState]=unmanaged',
    );
    expect(exported.status).toBe(200);
    const csv = await exported.text();
    expect(csv).toContain('OFF');
    expect(csv).not.toContain('SILENT');
  });

  it("lists a leaver's devices that synced after they left, to whoever may read them", async () => {
    const leaver = await created('master/people', {
      name: 'Lou Ho',
      email: 'lou@example.com',
      departmentId: 'dept-rd',
      leaveDate: dateAgo(10),
    });
    const stayer = await created('master/people', {
      name: 'Kim Ng',
      email: 'kim@example.com',
      departmentId: 'dept-rd',
    });
    await app.container.resolve(deviceSyncServiceToken).ingest(
      'intune',
      (async function* () {
        yield [
          observed('still-on', {
            userPrincipal: 'lou@example.com',
            lastSyncAt: ago(2),
          }),
          observed('before', {
            userPrincipal: 'lou@example.com',
            lastSyncAt: ago(20),
          }),
          observed('kims', {
            userPrincipal: 'kim@example.com',
            lastSyncAt: ago(1),
          }),
        ];
      })(),
      'schedule',
    );
    const online = await request(`device-sync/people/${leaver}/online`);
    expect(online.status).toBe(200);
    expect(await online.json()).toMatchObject({
      data: [{ deviceName: 'still-on', deviceId: null, source: 'intune' }],
    });
    // Somebody still here is online, as they should be.
    expect(
      await (await request(`device-sync/people/${stayer}/online`)).json(),
    ).toEqual({ data: [] });
    expect(
      (
        await request(
          `device-sync/people/${leaver}/online`,
          undefined,
          employee,
        )
      ).status,
    ).toBe(403);
    expect((await request('device-sync/people/nobody/online')).status).toBe(
      404,
    );
  });
});
