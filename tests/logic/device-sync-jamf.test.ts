// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import deviceSyncConfig from '../../server/config/device-sync.js';
import {
  configuredSources,
  consoleUrl,
  createJamfSource,
  type DeviceSource,
  type ObservedDevice,
} from '../../server/providers/itam/device-sources.js';
import {
  deviceReviewServiceToken,
  type DeviceReviewService,
} from '../../server/providers/itam/device-review.js';
import {
  deviceSyncServiceToken,
  type DeviceSyncService,
} from '../../server/providers/itam/device-sync.js';
import { deviceRoutes } from '../../server/routes/itam/devices.js';
import { masterDataRoutes } from '../../server/routes/itam/master-data.js';
import { createTestApp, json, type TestApp } from '../support/test-app.js';

const config = {
  url: 'https://acme.jamfcloud.com/',
  clientId: 'itam',
  clientSecret: 'secret',
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
const collect = async (source: DeviceSource) => {
  const pages: (readonly ObservedDevice[])[] = [];
  for await (const page of source.pages()) pages.push(page);
  return pages;
};

describe('Jamf Pro', () => {
  it('reads the computers, then the iPhones and iPads, page by page', async () => {
    const requests: { url: string; init?: RequestInit }[] = [];
    const computer = (id: string, serial: string) => ({
      id,
      general: {
        name: `Mac-${id}`,
        lastContactTime: '2026-10-14T08:00:00Z',
        lastEnrolledDate: '2026-01-02T09:00:00Z',
      },
      hardware: {
        make: 'Apple',
        model: 'MacBook Pro (14-inch, 2023)',
        serialNumber: serial,
        macAddress: 'aa:bb',
      },
      operatingSystem: {
        name: 'macOS',
        version: '15.6.1',
        fileVault2Status: id === '1' ? 'ALL_ENCRYPTED' : 'NOT_ENCRYPTED',
      },
      userAndLocation: {
        username: 'pat',
        realname: 'Pat Lee',
        email: 'pat@example.com',
      },
    });
    const answers = [
      reply(200, { access_token: 'jamf-token', expires_in: 1200 }),
      reply(200, {
        totalCount: 3,
        results: [computer('1', 'C1'), computer('2', 'C2')],
      }),
      reply(200, { totalCount: 3, results: [computer('3', 'C3')] }),
      reply(200, {
        totalCount: 2,
        results: [
          {
            mobileDeviceId: '7',
            deviceType: 'iOS',
            hardware: { serialNumber: 'P7', model: 'iPhone 15' },
            general: {
              displayName: "Kim's iPhone",
              osVersion: '18.6.2',
              lastInventoryUpdateDate: '2026-10-13T20:00:00Z',
              deviceOwnershipType: 'Institutional',
            },
            userAndLocation: {
              fullName: 'Kim Ng',
              emailAddress: 'kim@example.com',
            },
            security: { dataProtection: true },
          },
          {
            mobileDeviceId: '8',
            deviceType: 'iPadOS',
            hardware: { serialNumber: 'P8', model: 'iPad Air' },
            general: {
              displayName: 'iPad',
              deviceOwnershipType: 'PersonalDeviceProfile',
            },
            userAndLocation: {},
          },
        ],
      }),
    ];
    const source = createJamfSource(
      {
        url: 'https://acme.jamfcloud.com',
        clientId: 'itam',
        clientSecret: 'secret',
      },
      {
        pageSize: 2,
        fetch: async (url, init) => {
          requests.push({ url, init });
          const answer = answers.shift();
          if (!answer) throw new Error(`unexpected ${url}`);
          return answer;
        },
      },
    );
    const pages = await collect(source);
    expect(requests[0]!.url).toBe('https://acme.jamfcloud.com/api/oauth/token');
    expect(String(requests[0]!.init?.body)).toContain(
      'grant_type=client_credentials',
    );
    expect(requests[1]!.url).toBe(
      'https://acme.jamfcloud.com/api/v1/computers-inventory?section=GENERAL&section=HARDWARE&section=OPERATING_SYSTEM&section=USER_AND_LOCATION&page=0&page-size=2&sort=id%3Aasc',
    );
    expect(requests[2]!.url).toContain('page=1');
    expect(requests[3]!.url).toContain('/api/v2/mobile-devices/detail?');
    expect(
      (requests[3]!.init?.headers as Record<string, string>).authorization,
    ).toBe('Bearer jamf-token');
    // The second page of mobile devices is never asked for: it came short.
    expect(requests).toHaveLength(4);
    expect(pages.map((page) => page.length)).toEqual([2, 1, 2]);
    expect(pages[0]![0]).toMatchObject({
      externalId: 'computer:1',
      serialNo: 'C1',
      deviceName: 'Mac-1',
      manufacturer: 'Apple',
      osName: 'macOS',
      osVersion: '15.6.1',
      userPrincipal: 'pat@example.com',
      userName: 'Pat Lee',
      ownership: 'company',
      encrypted: true,
      lastSyncAt: '2026-10-14T08:00:00Z',
    });
    expect(pages[0]![1]!.encrypted).toBe(false);
    expect(pages[2]![0]).toMatchObject({
      externalId: 'mobile:7',
      serialNo: 'P7',
      osName: 'iOS',
      userPrincipal: 'kim@example.com',
      ownership: 'company',
      encrypted: true,
      lastSyncAt: '2026-10-13T20:00:00Z',
    });
    expect(pages[2]![1]!.ownership).toBe('personal');
  });

  it('names a refused sign-in and a missing privilege', async () => {
    const refused = createJamfSource(
      { url: 'https://acme.jamfcloud.com', clientId: 'a', clientSecret: 'b' },
      { fetch: async () => reply(401, { error: 'invalid_client' }) },
    );
    await expect(collect(refused)).rejects.toMatchObject({
      code: 'AUTH_FAILED',
      message: 'invalid_client',
    });
    const answers = [
      reply(200, { access_token: 't' }),
      reply(403, { errors: [{ description: 'Forbidden' }] }),
    ];
    const forbidden = createJamfSource(
      { url: 'https://acme.jamfcloud.com', clientId: 'a', clientSecret: 'b' },
      { fetch: async () => answers.shift()! },
    );
    await expect(collect(forbidden)).rejects.toMatchObject({
      code: 'PERMISSION_MISSING',
      message: 'Forbidden',
    });
  });

  it('connects Jamf only with all three values, and links to its own pages', () => {
    expect(
      configuredSources({ jamf: { url: config.url, clientId: 'x' } }),
    ).toEqual([]);
    expect(
      configuredSources({
        intune: { tenantId: 't', clientId: 'c', clientSecret: 's' },
        jamf: config,
      }).map((source) => source.key),
    ).toEqual(['intune', 'jamf']);
    expect(consoleUrl('jamf', 'computer:12', { jamf: config })).toBe(
      'https://acme.jamfcloud.com/computers.html?id=12&o=r',
    );
    expect(consoleUrl('jamf', 'mobile:7', { jamf: config })).toBe(
      'https://acme.jamfcloud.com/mobileDevices.html?id=7&o=r',
    );
    expect(consoleUrl('jamf', 'computer:12')).toBeNull();
  });

  it('refuses a half-configured Jamf, a placeholder or an address that is not https', async () => {
    const validate = deviceSyncConfig.rules!.validators[0] as (
      value: unknown,
      context: unknown,
    ) => void;
    const check = (value: unknown) => {
      const errors: string[] = [];
      validate(value, {
        error: (path: string) => errors.push(path),
        warning: () => undefined,
        isUserProvided: () => true,
      });
      return errors;
    };
    expect(check({ jamf: config })).toEqual([]);
    expect(check({ jamf: { url: config.url } })).toEqual([
      'jamf.clientId',
      'jamf.clientSecret',
    ]);
    expect(check({ jamf: { ...config, url: 'http://acme.local' } })).toEqual([
      'jamf.url',
    ]);
    expect(check({ jamf: { ...config, clientSecret: '${JAMF}' } })).toEqual([
      'jamf.clientSecret',
    ]);
  });
});

describe('a device on both Intune and Jamf', () => {
  let app: TestApp;
  let sync: DeviceSyncService;
  let review: DeviceReviewService;
  const ago = (days: number) =>
    new Date(Date.now() - days * 86_400_000).toISOString();
  const observed = (
    externalId: string,
    values: Partial<ObservedDevice>,
  ): ObservedDevice => ({
    externalId,
    serialNo: null,
    deviceName: 'MacBook',
    manufacturer: 'Apple',
    model: 'MacBook Pro 14 M3',
    osName: 'macOS',
    osVersion: '15.6.1',
    userPrincipal: null,
    userName: null,
    ownership: 'company',
    compliance: null,
    encrypted: true,
    wifiMac: null,
    enrolledAt: ago(100),
    lastSyncAt: ago(1),
    raw: { id: externalId },
    ...values,
  });
  async function* once(
    devices: ObservedDevice[],
  ): AsyncIterable<readonly ObservedDevice[]> {
    yield devices;
  }
  const created = async (path: string, body: Record<string, unknown>) => {
    const response = await app.request(`/api/itam/${path}`, {
      ...json(body),
      user: 'mia',
      role: 'manager',
    });
    if (response.status !== 201) throw new Error(await response.text());
    return ((await response.json()) as { data: { id: string } }).data.id;
  };

  beforeEach(async () => {
    app = await createTestApp({ seeds: true });
    for (const routes of [masterDataRoutes, deviceRoutes])
      await app.mount(routes);
    sync = app.container.resolve(deviceSyncServiceToken);
    review = app.container.resolve(deviceReviewServiceToken);
  });

  afterEach(async () => {
    await app.destroy();
  });

  it('shows both records, and takes the later sync as the platforms’ word', async () => {
    const pat = await created('master/people', {
      name: 'Pat Lee',
      email: 'pat@example.com',
      departmentId: 'dept-rd',
    });
    const mac = await created('devices', {
      modelId: 'model-macbook-pro-14-m3',
      locationId: 'loc-hq',
      serialNo: 'MAC-BOTH',
    });
    const assigned = await app.request(`/api/itam/devices/${mac}/assign`, {
      ...json({ targetType: 'person', targetId: pat }),
      user: 'mia',
      role: 'manager',
    });
    expect(assigned.status).toBe(200);
    // Intune last heard of it seven weeks ago; Jamf yesterday.
    await sync.ingest(
      'intune',
      once([observed('i1', { serialNo: 'MAC-BOTH', lastSyncAt: ago(49) })]),
      'schedule',
    );
    await sync.ingest(
      'jamf',
      once([observed('computer:1', { serialNo: 'MAC-BOTH' })]),
      'schedule',
    );
    expect((await sync.forDevice(mac)).map((view) => view.source)).toEqual([
      'jamf',
      'intune',
    ]);
    expect(await review.checks({ deviceIds: [mac] })).toEqual([]);
  });

  it('lists a device both report and the register lacks once, and keeps it off the register on both', async () => {
    await sync.ingest(
      'intune',
      once([observed('i2', { serialNo: 'NEW-MAC', lastSyncAt: ago(2) })]),
      'schedule',
    );
    await sync.ingest(
      'jamf',
      once([observed('computer:2', { serialNo: 'NEW-MAC' })]),
      'schedule',
    );
    const rows = await review.unregistered();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.sources).toEqual(['jamf', 'intune']);

    await review.ignore(rows[0]!.id, 'Loaner pool', 'mia');
    expect(await review.unregistered()).toEqual([]);
    const ignored = await review.ignored();
    expect(ignored).toHaveLength(1);
    // Kept off together, at the same moment: either may lead.
    expect([...ignored[0]!.sources].sort()).toEqual(['intune', 'jamf']);

    // Put on the register, both records link to it.
    await review.restore(ignored[0]!.id, 'mia');
    const mac = await created('devices', {
      modelId: 'model-macbook-pro-14-m3',
      locationId: 'loc-hq',
      serialNo: 'new-mac',
    });
    expect(
      (await sync.forDevice(mac)).map((view) => view.source).sort(),
    ).toEqual(['intune', 'jamf']);
  });
});
