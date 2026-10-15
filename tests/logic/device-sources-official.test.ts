// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  createIntuneSource,
  createJamfSource,
  type DeviceSource,
  type ObservedDevice,
} from '../../server/providers/itam/device-sources.js';

/**
 * The connectors against the platforms' own published shapes, since no
 * real tenant has been connected yet (2026-10-15). The Graph record is the
 * response example of "List managedDevices" in the Microsoft Graph v1.0
 * reference (properties ITAM does not read trimmed); the Jamf records follow
 * the field names of the Jamf Pro SDK's models (`macadmins/jamf-pro-sdk-python`,
 * `models/pro/computers.py` and `mobile_devices.py`) and of
 * `deploymenttheory/go-sdk-jamfpro-v2`, which also record that v1 of the
 * computer inventory was deprecated on 2025-06-30 for v3, and v3 on
 * 2026-07-14 for v4 (Jamf Pro 11.30), whose only change ITAM reads is
 * `general.lastContactTime` renamed `general.lastContact`. Both SDKs give
 * a mobile device's `userAndLocation.realName` and `security.dataProtected`;
 * the API reference's `fullName` and `dataProtection` are sort and filter
 * names, not the record's.
 */

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
const collect = async (source: DeviceSource) => {
  const pages: (readonly ObservedDevice[])[] = [];
  for await (const page of source.pages()) pages.push(page);
  return pages.flat();
};
const scripted = (answers: Response[], urls: string[]) => ({
  fetch: async (url: string) => {
    urls.push(url);
    const answer = answers.shift();
    if (!answer) throw new Error(`unexpected ${url}`);
    return answer;
  },
});

describe('Microsoft Graph, as its reference shows a managed device', () => {
  const documented = {
    '@odata.type': '#microsoft.graph.managedDevice',
    id: '705c034c-034c-705c-4c03-5c704c035c70',
    userId: 'User Id value',
    deviceName: 'Device Name value',
    managedDeviceOwnerType: 'company',
    managementState: 'retirePending',
    enrolledDateTime: '2016-12-31T23:59:43.797191-08:00',
    lastSyncDateTime: '2017-01-01T00:02:49.3205976-08:00',
    operatingSystem: 'Operating System value',
    complianceState: 'compliant',
    managementAgent: 'mdm',
    osVersion: 'Os Version value',
    deviceEnrollmentType: 'userEnrollment',
    emailAddress: 'Email Address value',
    isEncrypted: true,
    userPrincipalName: 'User Principal Name value',
    model: 'Model value',
    manufacturer: 'Manufacturer value',
    serialNumber: 'Serial Number value',
    userDisplayName: 'User Display Name value',
    wiFiMacAddress: 'Wi Fi Mac Address value',
    deviceHealthAttestationState: {
      '@odata.type': 'microsoft.graph.deviceHealthAttestationState',
      bitLockerStatus: 'Bit Locker Status value',
    },
    totalStorageSpaceInBytes: 8,
  };

  it('reads every field ITAM uses, its offset timestamps included', async () => {
    const urls: string[] = [];
    const source = createIntuneSource(
      { tenantId: 'tenant', clientId: 'client', clientSecret: 'secret' },
      scripted(
        [
          reply(200, {
            token_type: 'Bearer',
            expires_in: 3599,
            access_token: 'graph-token',
          }),
          reply(200, {
            '@odata.context':
              'https://graph.microsoft.com/v1.0/$metadata#deviceManagement/managedDevices',
            value: [documented],
          }),
        ],
        urls,
      ),
    );
    const [device] = await collect(source);
    expect(device).toMatchObject({
      externalId: '705c034c-034c-705c-4c03-5c704c035c70',
      serialNo: 'Serial Number value',
      deviceName: 'Device Name value',
      manufacturer: 'Manufacturer value',
      model: 'Model value',
      osName: 'Operating System value',
      osVersion: 'Os Version value',
      userPrincipal: 'User Principal Name value',
      userName: 'User Display Name value',
      ownership: 'company',
      compliance: 'compliant',
      encrypted: true,
      wifiMac: 'Wi Fi Mac Address value',
    });
    // Seven fractional digits and an offset, as Graph writes them, are
    // read as the instants they are.
    expect(new Date(device!.lastSyncAt!).toISOString()).toBe(
      '2017-01-01T08:02:49.320Z',
    );
    expect(new Date(device!.enrolledAt!).toISOString()).toBe(
      '2017-01-01T07:59:43.797Z',
    );
    // Every property the list asks for is one the reference documents.
    const select = new URL(urls[1]!).searchParams.get('$select')!.split(',');
    expect(select.filter((field) => !(field in documented))).toEqual([]);
  });
});

describe('Jamf Pro, as its SDK models the records', () => {
  const computer = {
    id: '1',
    udid: '9C3E5B3D-0000-0000-0000-000000000001',
    general: {
      name: 'MBP-0142',
      platform: 'Mac',
      reportDate: '2026-10-14T07:40:12.345Z',
      // v4's name for v3's lastContactTime.
      lastContact: '2026-10-14T08:01:02.003Z',
      lastEnrolledDate: '2025-03-02T01:02:03Z',
    },
    hardware: {
      make: 'Apple',
      model: 'MacBook Pro (14-inch, Nov 2023)',
      modelIdentifier: 'Mac15,3',
      serialNumber: 'C02XK1A02MD6T',
      macAddress: '3C:22:FB:00:00:01',
    },
    operatingSystem: {
      name: 'macOS',
      version: '15.6.1',
      build: '24G90',
      fileVault2Status: 'SOME_ENCRYPTED',
    },
    userAndLocation: {
      username: 'pat',
      realname: 'Pat Lee',
      email: 'pat@example.com',
      position: 'Engineer',
    },
  };
  const phone = {
    mobileDeviceId: '7',
    deviceType: 'iOS',
    hardware: {
      serialNumber: 'F2LXK0AAAA01',
      wifiMacAddress: '3C:22:FB:00:00:07',
      model: 'iPhone 15',
      modelIdentifier: 'iPhone15,4',
    },
    userAndLocation: {
      username: 'kim',
      realName: 'Kim Ng',
      emailAddress: 'kim@example.com',
    },
    general: {
      displayName: "Kim's iPhone",
      lastInventoryUpdateDate: '2026-10-13T20:00:00Z',
      osVersion: '18.6.2',
      managed: true,
      deviceOwnershipType: 'AccountDrivenUserEnrollment',
      lastEnrolledDate: '2025-05-06T07:08:09Z',
    },
    security: { dataProtected: true, passcodePresent: true },
  };

  it('reads the v4 computer inventory, then the iPhones by mobileDeviceId', async () => {
    const urls: string[] = [];
    const devices = await collect(
      createJamfSource(
        { url: 'https://acme.jamfcloud.com', clientId: 'a', clientSecret: 'b' },
        scripted(
          [
            reply(200, {
              access_token: 'jamf-token',
              scope: 'api-role:2',
              token_type: 'Bearer',
              expires_in: 59,
            }),
            reply(200, { totalCount: 1, results: [computer] }),
            reply(200, { totalCount: 1, results: [phone] }),
          ],
          urls,
        ),
      ),
    );
    expect(urls[1]).toContain('/api/v4/computers-inventory?');
    expect(urls[1]).toContain('sort=id%3Aasc');
    expect(urls[2]).toContain('/api/v2/mobile-devices/detail?');
    expect(urls[2]).toContain('sort=mobileDeviceId%3Aasc');
    expect(devices[0]).toMatchObject({
      externalId: 'computer:1',
      serialNo: 'C02XK1A02MD6T',
      deviceName: 'MBP-0142',
      model: 'MacBook Pro (14-inch, Nov 2023)',
      osVersion: '15.6.1',
      userPrincipal: 'pat@example.com',
      userName: 'Pat Lee',
      // Partly encrypted says neither yes nor no.
      encrypted: null,
      lastSyncAt: '2026-10-14T08:01:02.003Z',
    });
    expect(devices[1]).toMatchObject({
      externalId: 'mobile:7',
      serialNo: 'F2LXK0AAAA01',
      deviceName: "Kim's iPhone",
      userPrincipal: 'kim@example.com',
      userName: 'Kim Ng',
      // An account-driven user enrollment is a person's own device.
      ownership: 'personal',
      encrypted: true,
      wifiMac: '3C:22:FB:00:00:07',
    });
  });

  it('falls back to v3, then v1, of the computer inventory on an older Jamf Pro', async () => {
    const urls: string[] = [];
    const devices = await collect(
      createJamfSource(
        { url: 'https://acme.jamfcloud.com', clientId: 'a', clientSecret: 'b' },
        scripted(
          [
            reply(200, { access_token: 't' }),
            reply(404, {
              httpStatus: 404,
              errors: [{ code: 'NOT_FOUND', description: 'Not Found' }],
            }),
            reply(404, {}),
            // v1 and v3 still call it lastContactTime.
            reply(200, {
              totalCount: 1,
              results: [
                {
                  ...computer,
                  general: {
                    name: 'MBP-0142',
                    lastContactTime: '2026-10-12T00:00:00Z',
                  },
                },
              ],
            }),
            reply(200, { totalCount: 0, results: [] }),
          ],
          urls,
        ),
      ),
    );
    expect(urls.slice(1).map((url) => new URL(url).pathname)).toEqual([
      '/api/v4/computers-inventory',
      '/api/v3/computers-inventory',
      '/api/v1/computers-inventory',
      '/api/v2/mobile-devices/detail',
    ]);
    expect(new URL(urls[3]!).searchParams.get('page')).toBe('0');
    expect(devices.map((device) => device.externalId)).toEqual(['computer:1']);
    expect(devices[0]!.lastSyncAt).toBe('2026-10-12T00:00:00Z');
  });

  it('does not fall back past a 404 for the iPhones', async () => {
    const source = createJamfSource(
      { url: 'https://acme.jamfcloud.com', clientId: 'a', clientSecret: 'b' },
      scripted(
        [
          reply(200, { access_token: 't' }),
          reply(200, { totalCount: 0, results: [] }),
          reply(404, { errors: [{ description: 'Not Found' }] }),
        ],
        [],
      ),
    );
    await expect(collect(source)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
  });
});
