// @vitest-environment node
import { databaseManagerToken } from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import migration from '../../database/main/migrations/202610150001_device_sync_dismissals.js';
import exemptionsMigration from '../../database/main/migrations/202610150003_device_sync_exemptions.js';
import type { ObservedDevice } from '../../server/providers/itam/device-sources.js';
import {
  deviceReviewServiceToken,
  type DeviceReviewService,
} from '../../server/providers/itam/device-review.js';
import {
  deviceSyncServiceToken,
  type DeviceSyncService,
} from '../../server/providers/itam/device-sync.js';
import { historyServiceToken } from '../../server/providers/itam/history.js';
import { maintenanceServiceToken } from '../../server/providers/itam/maintenance.js';
import { settingsServiceToken } from '../../server/providers/itam/settings.js';
import { workbenchServiceToken } from '../../server/providers/itam/workbench.js';
import { deviceRoutes } from '../../server/routes/itam/devices.js';
import { deviceSyncRoutes } from '../../server/routes/itam/device-sync.js';
import { masterDataRoutes } from '../../server/routes/itam/master-data.js';
import { createTestDatabase, schemaClient } from '../support/test-database.js';
import { createTestApp, json, type TestApp } from '../support/test-app.js';

const manager = { user: 'mia', role: 'manager' as const };
const support = { user: 'sam', role: 'support' as const };
const employee = { user: 'eve', role: 'employee' as const };

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

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
  osVersion: '10.0.26100',
  userPrincipal: null,
  userName: null,
  ownership: 'company',
  compliance: 'compliant',
  encrypted: true,
  wifiMac: null,
  enrolledAt: ago(200),
  lastSyncAt: ago(1),
  raw: { id: externalId },
  ...overrides,
});

async function* pagesOf(
  ...pages: readonly (readonly ObservedDevice[])[]
): AsyncIterable<readonly ObservedDevice[]> {
  for (const page of pages) yield page;
}

describe('device review', () => {
  let app: TestApp;
  let sync: DeviceSyncService;
  let review: DeviceReviewService;
  const request = (
    path: string,
    body?: Record<string, unknown>,
    who: Record<string, string> = manager,
  ) =>
    app.request(`/api/itam/${path}`, {
      ...(body ? json(body) : {}),
      ...who,
    });
  const created = async (path: string, body: Record<string, unknown>) => {
    const response = await request(path, body);
    if (response.status !== 201)
      throw new Error(`${path}: ${await response.text()}`);
    return ((await response.json()) as { data: { id: string } }).data.id;
  };
  const person = (name: string, email: string) =>
    created('master/people', { name, email, departmentId: 'dept-rd' });
  const device = (serialNo: string, modelId = 'model-thinkpad-t14-gen5') =>
    created('devices', { modelId, locationId: 'loc-hq', serialNo });
  const assign = async (deviceId: string, personId: string) => {
    const response = await request(`devices/${deviceId}/assign`, {
      targetType: 'person',
      targetId: personId,
    });
    if (response.status !== 200) throw new Error(await response.text());
  };
  const pull = (...devices: ObservedDevice[]) =>
    sync.ingest('intune', pagesOf(devices), 'schedule');
  const kinds = async (deviceId?: string) =>
    (await review.checks(deviceId ? { deviceIds: [deviceId] } : {})).map(
      (check) => [check.deviceId, check.kind, check.critical],
    );
  const managedId = async (externalId: string) =>
    (
      await app.container
        .resolve(databaseManagerToken)
        .query()
        .selectFrom('managedDevices')
        .select('id')
        .where('externalId', '=', externalId)
        .executeTakeFirstOrThrow<{ id: string }>()
    ).id;

  beforeEach(async () => {
    app = await createTestApp({ seeds: true });
    for (const routes of [masterDataRoutes, deviceRoutes, deviceSyncRoutes])
      await app.mount(routes);
    sync = app.container.resolve(deviceSyncServiceToken);
    review = app.container.resolve(deviceReviewServiceToken);
  });

  afterEach(async () => {
    await app.destroy();
  });

  it('finds nothing while no platform has reported', async () => {
    await device('QUIET-1');
    expect(await review.active()).toBe(false);
    expect(await review.checks()).toEqual([]);
    expect(await review.unmanaged()).toEqual([]);
  });

  it('calls a device in use silent once it has not synced for the threshold, or the platform dropped it', async () => {
    const pat = await person('Pat Lee', 'pat@example.com');
    const silent = await device('SILENT-1');
    const fresh = await device('FRESH-1');
    const dropped = await device('DROPPED-1');
    for (const id of [silent, fresh, dropped]) await assign(id, pat);
    await pull(
      observed('s', {
        serialNo: 'SILENT-1',
        lastSyncAt: ago(45),
        userPrincipal: 'pat@example.com',
      }),
      observed('f', { serialNo: 'FRESH-1', userPrincipal: 'pat@example.com' }),
      observed('d', {
        serialNo: 'DROPPED-1',
        userPrincipal: 'pat@example.com',
      }),
    );
    // A complete pull that no longer reports `d` marks it gone.
    await pull(
      observed('s', {
        serialNo: 'SILENT-1',
        lastSyncAt: ago(45),
        userPrincipal: 'pat@example.com',
      }),
      observed('f', { serialNo: 'FRESH-1', userPrincipal: 'pat@example.com' }),
    );
    expect(await kinds()).toEqual(
      expect.arrayContaining([
        [silent, 'stale', false],
        [dropped, 'stale', false],
      ]),
    );
    expect(await kinds(fresh)).toEqual([]);
    const [gone] = await review.checks({ deviceIds: [dropped] });
    expect(gone.value).toBe('gone');
  });

  it('raises another primary user until a person keeps the register, and again when the user changes', async () => {
    const pat = await person('Pat Lee', 'pat@example.com');
    const kim = await person('Kim Ng', 'kim@example.com');
    await person('Lou Ho', 'lou@example.com');
    const laptop = await device('MOVED-1');
    await assign(laptop, pat);
    await pull(
      observed('m', { serialNo: 'MOVED-1', userPrincipal: 'KIM@example.com' }),
    );
    const [check] = await review.checks({ deviceIds: [laptop] });
    expect(check).toMatchObject({
      kind: 'userMismatch',
      personId: kim,
      assigneeId: pat,
      value: kim,
    });

    expect(
      (
        await request(
          `device-sync/checks/${laptop}/dismiss`,
          {
            kind: 'userMismatch',
          },
          employee,
        )
      ).status,
    ).toBe(403);
    const dismissed = await request(`device-sync/checks/${laptop}/dismiss`, {
      kind: 'userMismatch',
    });
    expect(dismissed.status).toBe(200);
    expect(await kinds(laptop)).toEqual([]);
    const events = await app.container
      .resolve(historyServiceToken)
      .events({ subjectType: 'devices', subjectId: laptop });
    expect(
      events.data.find((event) => event.type === 'managedDismissed'),
    ).toMatchObject({ actorId: 'mia', payload: { kind: 'userMismatch' } });

    // Another user on the platform is another difference.
    await pull(
      observed('m', { serialNo: 'MOVED-1', userPrincipal: 'lou@example.com' }),
    );
    expect(await kinds(laptop)).toEqual([[laptop, 'userMismatch', false]]);
    // Handing it to that person settles it.
    const lou = (
      await app.container
        .resolve(databaseManagerToken)
        .query()
        .selectFrom('people')
        .select('id')
        .where('email', '=', 'lou@example.com')
        .executeTakeFirstOrThrow<{ id: string }>()
    ).id;
    expect(
      (
        await request(`devices/${laptop}/transfer`, {
          targetType: 'person',
          targetId: lou,
        })
      ).status,
    ).toBe(200);
    expect(await kinds(laptop)).toEqual([]);
  });

  it('flags a device online while the register has it off duty, a lost one as critical', async () => {
    const shelf = await device('SHELF-1');
    const lost = await device('LOST-1');
    expect(
      (await request(`devices/${lost}/mark-lost`, { notes: 'Not found' }))
        .status,
    ).toBe(200);
    const old = await device('OLD-1');
    await pull(
      observed('a', { serialNo: 'SHELF-1' }),
      observed('b', { serialNo: 'LOST-1' }),
      // In stock and quiet for three weeks: nothing to say.
      observed('c', { serialNo: 'OLD-1', lastSyncAt: ago(21) }),
    );
    expect(await kinds()).toEqual([
      [lost, 'statusMismatch', true],
      [shelf, 'statusMismatch', false],
    ]);
    expect(await kinds(old)).toEqual([]);
  });

  it('leaves personal devices out while the setting says so', async () => {
    const shelf = await device('MINE-1');
    await pull(observed('p', { serialNo: 'MINE-1', ownership: 'personal' }));
    expect(await kinds(shelf)).toEqual([]);
    await app.container.resolve(settingsServiceToken).set('deviceSync', {
      staleDays: 30,
      recentDays: 7,
      managedCategoryIds: [],
      ignorePersonal: false,
    });
    expect(await kinds(shelf)).toEqual([[shelf, 'statusMismatch', false]]);
  });

  it('lists what the platform reports and the register lacks, with a model to register it as', async () => {
    await pull(
      observed('new', { serialNo: 'NEW-1', deviceName: 'LAPTOP-NEW' }),
      observed('old', { serialNo: 'OLD-2', lastSyncAt: ago(60) }),
      observed('own', { serialNo: 'OWN-1', ownership: 'personal' }),
    );
    const rows = await review.unregistered();
    expect(rows.map((row) => row.externalId)).toEqual(['new']);
    expect(rows[0]).toMatchObject({
      serialNo: 'NEW-1',
      suggestedModelId: 'model-thinkpad-t14-gen5',
      matchState: 'unlinked',
    });
  });

  it('fills 补登记 from the model with or without its maker, the maker by name, and the user’s department', async () => {
    await person('Kim Ng', 'kim@example.com');
    await pull(
      // Intune writes the maker in front of the model.
      observed('prefixed', {
        serialNo: 'PRE-1',
        model: 'Lenovo ThinkPad T14 Gen 5',
        userPrincipal: 'kim@example.com',
      }),
      // A model the register lacks: the maker is still known by name.
      observed('unknown', {
        serialNo: 'UNK-1',
        manufacturer: 'HP',
        model: 'HP ZHAN66 16+ G1i',
      }),
    );
    const rows = new Map(
      (await review.unregistered()).map((row) => [row.externalId, row]),
    );
    expect(rows.get('prefixed')).toMatchObject({
      suggestedModelId: 'model-thinkpad-t14-gen5',
      suggestedManufacturerId: 'mfr-lenovo',
      suggestedDepartmentId: 'dept-rd',
    });
    expect(rows.get('unknown')).toMatchObject({
      suggestedModelId: null,
      suggestedCategoryId: null,
      suggestedManufacturerId: 'mfr-hp',
      suggestedDepartmentId: null,
    });
  });

  it('lists the personal devices the rules leave out with the ignored, until the rule is off', async () => {
    await pull(
      observed('own', { serialNo: 'OWN-1', ownership: 'personal' }),
      observed('new', { serialNo: 'NEW-1' }),
    );
    expect(await review.ignored()).toMatchObject([
      { externalId: 'own', ignoredByRule: true, ignoredById: null },
    ]);
    await app.container.resolve(settingsServiceToken).set('deviceSync', {
      staleDays: 30,
      recentDays: 7,
      managedCategoryIds: [],
      ignorePersonal: false,
    });
    expect(await review.ignored()).toEqual([]);
    expect(
      (await review.unregistered()).map((row) => row.externalId).sort(),
    ).toEqual(['new', 'own']);
  });

  it('keeps a record off the register and takes it back, matching it again', async () => {
    await pull(observed('vm', { serialNo: 'LATER-1' }));
    const id = await managedId('vm');
    expect(
      (
        await request(
          `device-sync/devices/${id}/ignore`,
          {
            reason: 'Build server',
          },
          employee,
        )
      ).status,
    ).toBe(403);
    const ignored = await request(`device-sync/devices/${id}/ignore`, {
      reason: 'Build server',
    });
    expect(ignored.status).toBe(200);
    expect(await review.unregistered()).toEqual([]);
    expect(await review.ignored()).toMatchObject([
      { id, ignoreReason: 'Build server', ignoredById: 'mia' },
    ]);
    // A pull leaves it ignored.
    await pull(observed('vm', { serialNo: 'LATER-1' }));
    expect(await review.ignored()).toHaveLength(1);

    const laptop = await device('LATER-1');
    expect(
      (await request(`device-sync/devices/${id}/restore`, {})).status,
    ).toBe(200);
    expect(await review.ignored()).toEqual([]);
    expect(await sync.forDevice(laptop)).toHaveLength(1);
  });

  it('links by hand and unlinks for good, both on the timeline', async () => {
    const laptop = await device('BOOK-SERIAL');
    await pull(observed('x', { serialNo: 'PLATFORM-SERIAL' }));
    const id = await managedId('x');
    const linked = await request(`device-sync/devices/${id}/link`, {
      deviceId: laptop,
    });
    expect(linked.status).toBe(200);
    expect(await linked.json()).toMatchObject({
      data: { deviceId: laptop, matchState: 'linked', matchedBy: 'manual' },
    });
    // The next pull keeps a person's link although the serials differ.
    await pull(observed('x', { serialNo: 'PLATFORM-SERIAL' }));
    expect(await sync.forDevice(laptop)).toHaveLength(1);

    expect(
      (await request(`device-sync/devices/${id}/unlink`, {}, employee)).status,
    ).toBe(403);
    expect((await request(`device-sync/devices/${id}/unlink`, {})).status).toBe(
      200,
    );
    // An unlink is a decision too: the same serial does not link it again.
    await pull(observed('x', { serialNo: 'BOOK-SERIAL' }));
    expect(await sync.forDevice(laptop)).toEqual([]);
    const types = (
      await app.container
        .resolve(historyServiceToken)
        .events({ subjectType: 'devices', subjectId: laptop })
    ).data.map((event) => event.type);
    expect(types).toEqual(
      expect.arrayContaining(['managedLinked', 'managedUnlinked']),
    );
  });

  it('links a device put on the register to the platform record of its serial at once (补登记)', async () => {
    await pull(observed('reg', { serialNo: 'REGISTER-ME' }));
    expect(await review.unregistered()).toHaveLength(1);
    const laptop = await device(' register-me ');
    expect(await review.unregistered()).toEqual([]);
    expect(await sync.forDevice(laptop)).toMatchObject([
      { externalId: 'reg', matchedBy: 'serial' },
    ]);
  });

  it('lists devices in use of a managed category that no platform reports', async () => {
    const pat = await person('Pat Lee', 'pat@example.com');
    const managed = await device('ON-PLATFORM');
    const unmanaged = await device('OFF-PLATFORM');
    // A monitor is not a managed category.
    const monitor = await device('MON-1', 'model-u2723qe');
    for (const id of [managed, unmanaged, monitor]) await assign(id, pat);
    await pull(
      observed('on', {
        serialNo: 'ON-PLATFORM',
        userPrincipal: 'pat@example.com',
      }),
    );
    expect((await review.unmanaged()).map((row) => row.id)).toEqual([
      unmanaged,
    ]);
  });

  it('marks a 只在台账 device 不需要纳管 with a reason, takes it back, and lets it lapse once a platform reports it', async () => {
    const pat = await person('Pat Lee', 'pat@example.com');
    const linux = await device('LINUX-1');
    const laptop = await device('ON-1');
    for (const id of [linux, laptop]) await assign(id, pat);
    await pull(observed('on', { serialNo: 'ON-1' }));
    const exempt = (id: string, who = manager) =>
      request(
        `device-sync/unmanaged/${id}/exempt`,
        { reason: 'Linux workstation' },
        who,
      );
    expect(
      (
        await app.request(`/api/itam/device-sync/unmanaged/${linux}/exempt`, {
          ...json({ reason: 'x' }),
        })
      ).status,
    ).toBe(401);
    expect((await exempt(linux, employee)).status).toBe(403);
    // A reason is required, and only a 只在台账 device can be marked.
    expect(
      (await request(`device-sync/unmanaged/${linux}/exempt`, { reason: ' ' }))
        .status,
    ).toBe(400);
    expect((await exempt(laptop)).status).toBe(422);

    expect((await exempt(linux)).status).toBe(200);
    expect(await review.unmanaged()).toEqual([]);
    expect(await review.exempted()).toMatchObject([
      { id: linux, reason: 'Linux workstation', exemptedById: 'mia' },
    ]);
    const view = await request('device-sync/review?view=exempted');
    expect(await view.json()).toMatchObject({ data: [{ id: linux }] });
    const managed = await request(`devices/${linux}/managed`);
    expect(await managed.json()).toMatchObject({
      exemption: { reason: 'Linux workstation' },
    });
    const events = await app.container
      .resolve(historyServiceToken)
      .events({ subjectType: 'devices', subjectId: linux });
    expect(
      events.data.find((event) => event.type === 'managedExempted'),
    ).toMatchObject({
      actorId: 'mia',
      payload: { reason: 'Linux workstation' },
    });

    expect(
      (await request(`device-sync/unmanaged/${linux}/unexempt`, {})).status,
    ).toBe(200);
    expect((await review.unmanaged()).map((row) => row.id)).toEqual([linux]);
    expect(await review.exempted()).toEqual([]);

    // Enrolled after all: the mark lapses, and does not come back should
    // the device drop off the platform again — it is 失联 then.
    await exempt(linux);
    await pull(
      observed('on', { serialNo: 'ON-1' }),
      observed('lx', { serialNo: 'LINUX-1' }),
    );
    expect(await review.exemptionOf(linux)).toBeNull();
    await pull(observed('on', { serialNo: 'ON-1' }));
    expect(await review.exemptionOf(linux)).toBeNull();
    expect(await kinds(linux)).toEqual([[linux, 'stale', false]]);
  });

  it('lists a device the platform stopped reporting as 失联 only, and as 只在台账 once the register is kept', async () => {
    const pat = await person('Pat Lee', 'pat@example.com');
    const laptop = await device('GONE-1');
    const other = await device('STAY-1');
    for (const id of [laptop, other]) await assign(id, pat);
    await pull(
      observed('g', { serialNo: 'GONE-1' }),
      observed('s', { serialNo: 'STAY-1' }),
    );
    await pull(observed('s', { serialNo: 'STAY-1' }));
    expect(await kinds(laptop)).toEqual([[laptop, 'stale', false]]);
    expect(await review.unmanaged()).toEqual([]);
    const dismissed = await request(`device-sync/checks/${laptop}/dismiss`, {
      kind: 'stale',
    });
    expect(dismissed.status).toBe(200);
    expect((await review.unmanaged()).map((row) => row.id)).toEqual([laptop]);
  });

  it("counts a leaver's devices that synced after the leave date", async () => {
    const pat = await person('Pat Lee', 'pat@example.com');
    await pull(
      observed('a', { userPrincipal: 'pat@example.com', lastSyncAt: ago(1) }),
      observed('b', { userPrincipal: 'pat@example.com', lastSyncAt: ago(20) }),
    );
    const leaveDate = new Date(Date.now() - 10 * DAY)
      .toISOString()
      .slice(0, 10);
    expect(await review.onlineAfterLeaving([{ id: pat, leaveDate }])).toEqual(
      new Map([[pat, 1]]),
    );
  });

  it('puts the differences on the board as 设备核对, narrowed to the reader for 我负责的', async () => {
    const pat = await person('Pat Lee', 'pat@example.com');
    const laptop = await device('BOARD-1');
    await assign(laptop, pat);
    await pull(observed('b', { serialNo: 'BOARD-1', lastSyncAt: ago(40) }));
    const workbench = app.container.resolve(workbenchServiceToken);
    // Every collection, every record: a manager as the harness grants.
    const decide = async (collection: string, action: string) =>
      ({
        type: 'database',
        collection,
        action,
        scope: true,
        fields: [],
        fieldAccess: { input: '*', output: '*' },
      }) as never;
    const items = await workbench.myWork('mia', decide);
    expect(items.find((item) => item.key === 'deviceChecks')).toMatchObject({
      count: 1,
      records: [{ id: laptop, check: { kind: 'stale', critical: false } }],
    });
    const mine = await workbench.myWork('somebody-else', decide, {
      scope: 'mine',
    });
    expect(mine.find((item) => item.key === 'deviceChecks')?.count).toBe(0);
  });

  it('counts 只在 MDM and 只在台账 on the MDM 核对 column, not in 需要关注', async () => {
    const pat = await person('Pat Lee', 'pat@example.com');
    const off = await device('OFF-BOARD');
    await assign(off, pat);
    await pull(observed('new', { serialNo: 'NEW-BOARD' }));
    const workbench = app.container.resolve(workbenchServiceToken);
    const decide =
      (denied?: string) => async (collection: string, action: string) =>
        action === denied
          ? null
          : ({
              type: 'database',
              collection,
              action,
              scope: true,
              fields: [],
              fieldAccess: { input: '*', output: '*' },
            } as never);
    const column = async (
      userId: string,
      options?: { denied?: string; scope?: 'mine' },
    ) =>
      (
        await workbench.myWork(userId, decide(options?.denied), {
          scope: options?.scope ?? 'all',
        })
      ).find((item) => item.key === 'deviceChecks');
    expect((await column('mia'))?.summary).toEqual({
      unregistered: 1,
      unmanaged: 1,
    });
    // 只在台账 has a 负责人; a record not on the register has nobody's name.
    expect((await column('somebody-else', { scope: 'mine' }))?.summary).toEqual(
      { unregistered: 1, unmanaged: 0 },
    );
    // Registering is creating a device.
    expect((await column('mia', { denied: 'create' }))?.summary).toEqual({
      unmanaged: 1,
    });
    const kinds = (
      await app.container.resolve(maintenanceServiceToken).reminderCounts()
    ).map((entry) => String(entry.kind));
    expect(kinds).not.toContain('managedUnregistered');
    expect(kinds).not.toContain('deviceUnmanaged');
  });

  it('lists each view to whoever may read devices', async () => {
    await pull(observed('u', { serialNo: 'VIEW-1' }));
    expect((await app.request('/api/itam/device-sync/review')).status).toBe(
      401,
    );
    expect(
      (
        await request(
          'device-sync/review?view=unregistered',
          undefined,
          employee,
        )
      ).status,
    ).toBe(403);
    const response = await request(
      'device-sync/review?view=unregistered',
      undefined,
      support,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: [{ externalId: 'u' }],
    });
    expect((await request('device-sync/review?view=nonsense')).status).toBe(
      400,
    );
  });
});

describe('device sync dismissals migration', () => {
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
      expect(await client.schema.hasTable('device_sync_dismissals')).toBe(true);
      await migration.down!(context);
      expect(await client.schema.hasTable('device_sync_dismissals')).toBe(
        false,
      );
      await migration.up(context);
      expect(
        await client.schema.hasColumn('device_sync_dismissals', 'value'),
      ).toBe(true);
    } finally {
      await db.destroy();
    }
  });
});

describe('device sync exemptions migration', () => {
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
      expect(await client.schema.hasTable('device_sync_exemptions')).toBe(true);
      await exemptionsMigration.down!(context);
      expect(await client.schema.hasTable('device_sync_exemptions')).toBe(
        false,
      );
      await exemptionsMigration.up(context);
      expect(
        await client.schema.hasColumn('device_sync_exemptions', 'reason'),
      ).toBe(true);
    } finally {
      await db.destroy();
    }
  });
});
