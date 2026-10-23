// @vitest-environment node
import { databaseManagerToken } from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  maintenanceServiceToken,
  numberingServiceToken,
} from '../../server/providers/index.js';
import { parseCsv, toCsv } from '../../server/providers/itam/csv.js';
import type { CommentInput } from '../../server/providers/itam/comments.js';
import { createDemoService } from '../../server/providers/itam/demo.js';
import {
  auditServiceToken,
  deviceServiceToken,
  disposalServiceToken,
  entitlementServiceToken,
  masterDataServiceToken,
  procurementServiceToken,
  repairServiceToken,
  stockServiceToken,
} from '../../server/providers/itam/index.js';
import { deviceConnectionsServiceToken } from '../../server/providers/itam/device-connections.js';
import { deviceReviewServiceToken } from '../../server/providers/itam/device-review.js';
import { deviceSyncServiceToken } from '../../server/providers/itam/device-sync.js';
import { workbenchServiceToken } from '../../server/providers/itam/workbench.js';
import { addDays, today } from '../../server/providers/itam/dates.js';
import { deviceRoutes } from '../../server/routes/itam/devices.js';
import { dataRoutes } from '../../server/routes/itam/data.js';
import { entitlementRoutes } from '../../server/routes/itam/entitlements.js';
import { masterDataRoutes } from '../../server/routes/itam/master-data.js';
import { purchaseOrderRoutes } from '../../server/routes/itam/purchase-orders.js';
import { stockRoutes } from '../../server/routes/itam/stock.js';
import { workbenchRoutes } from '../../server/routes/itam/workbench.js';
import { createTestApp, json, type TestApp } from '../support/test-app.js';

const manager = { user: 'mia', role: 'manager' as const };
const employee = { user: 'li', role: 'employee' as const };

describe('CSV import / export and demo data', () => {
  let app: TestApp;
  const post = (
    path: string,
    body: Record<string, unknown> = {},
    who: { user: string; role: 'employee' | 'support' | 'manager' } = manager,
  ) => app.request(`/api/itam/${path}`, { ...json(body), ...who });
  const get = (
    path: string,
    who: { user: string; role: 'employee' | 'support' | 'manager' } = manager,
  ) => app.request(`/api/itam/${path}`, who);
  const data = async <T = Record<string, unknown>>(
    response: Response,
  ): Promise<T> => ((await response.json()) as { data: T }).data;
  // An import is started and runs in the background (2026-10-16): this
  // waits for it, and answers the status it ends on, or the refusal.
  const generateDemo = async (body: Record<string, unknown> = {}) => {
    const started = await post('demo/generate', body);
    if (started.status !== 200) return started;
    for (;;) {
      const status = await get('demo');
      const summary = (await status.clone().json()) as {
        data: { importing: unknown; failure: { message: string } | null };
      };
      if (summary.data.failure) throw new Error(summary.data.failure.message);
      if (!summary.data.importing) return status;
      await new Promise((done) => setTimeout(done, 20));
    }
  };

  beforeEach(async () => {
    app = await createTestApp({ seeds: true });
    for (const routes of [
      masterDataRoutes,
      deviceRoutes,
      entitlementRoutes,
      purchaseOrderRoutes,
      stockRoutes,
      workbenchRoutes,
      dataRoutes,
    ])
      await app.mount(routes);
  });

  afterEach(async () => {
    await app.destroy();
  });

  it('parses and writes CSV with quotes, commas and newlines', () => {
    const table = parseCsv(
      '﻿name,notes\r\n"Acme, Inc.","multi\nline"\r\nplain,""\r\n',
    );
    expect(table.columns).toEqual(['name', 'notes']);
    expect(table.rows).toEqual([
      { name: 'Acme, Inc.', notes: 'multi\nline' },
      { name: 'plain', notes: '' },
    ]);
    const csv = toCsv(['name', 'notes'], table.rows);
    expect(parseCsv(csv).rows).toEqual(table.rows);
  });

  it('imports people, their status following the dates in the file', async () => {
    // The spec sent a status of its own, which creating a person refuses —
    // every row of a people import failed until 2026-10-06.
    expect(
      (await post('imports/departments/commit', { csv: 'Name\nImport Dept\n' }))
        .status,
    ).toBe(200);
    const csv = [
      'Name,Employee No,Department,Hire Date,Leave Date',
      'Early Bird,E-1,Import Dept,2020-01-01,',
      'New Face,E-2,Import Dept,2099-01-01,',
      'Gone Soon,E-3,Import Dept,2020-01-01,2020-06-30',
    ].join('\n');
    const committed = await data<{
      creates: number;
      errors: number;
      rows: { status: string; id?: string; errors?: string[] }[];
    }>(await post('imports/people/commit', { csv }));
    expect(committed.rows.flatMap((row) => row.errors ?? [])).toEqual([]);
    expect(committed.creates).toBe(3);
    const statuses = await Promise.all(
      committed.rows.map(
        async (row) =>
          (
            await data<{ employmentStatus: string }>(
              await get(`master/people/${row.id}`),
            )
          ).employmentStatus,
      ),
    );
    expect(statuses).toEqual(['active', 'pending', 'left']);
  });

  it('imports master data then devices by name references, reports errors, exports the filter', async () => {
    const step = (
      collection: string,
      name: string,
      csv: string,
      mapping?: Record<string, string>,
    ) =>
      post(
        `imports/${collection}/${name}`,
        mapping ? { csv, mapping } : { csv },
      );
    const manufacturers = 'Name,Website\nDemo Apple,https://apple.example\n';
    expect((await step('manufacturers', 'commit', manufacturers)).status).toBe(
      200,
    );
    await step(
      'categories',
      'commit',
      'name,appliesTo,requiresSerial\nLaptop,device,yes\n',
    );
    const models = 'Model,Category,Brand\nMacBook Pro 14,Laptop,Demo Apple\n';
    const preview = await data<{
      mapping: Record<string, string>;
      total: number;
    }>(await step('models', 'preview', models));
    expect(preview.mapping).toEqual({
      name: 'Model',
      categoryId: 'Category',
      manufacturerId: 'Brand',
    });
    expect((await step('models', 'commit', models)).status).toBe(200);
    await step('locations', 'commit', 'name,type\nHQ,company\n');

    const devicesCsv = [
      'Device No,Serial,Model,Location,Purchase Date,Price',
      'AS-100,SN-A,MacBook Pro 14,HQ,2025-03-01,12000',
      ',SN-B,MacBook Pro 14,HQ,2025/3/2,9000',
      ',SN-C,Unknown model,HQ,2025-03-03,1',
      ',SN-A,MacBook Pro 14,HQ,bad-date,1',
    ].join('\n');
    const validated = await data<{
      creates: number;
      errors: number;
      rows: { line: number; errors: string[] }[];
    }>(await step('devices', 'validate', devicesCsv));
    expect(validated.creates).toBe(2);
    expect(validated.errors).toBe(2);
    expect(validated.rows[2]?.errors[0]).toContain('modelId');
    expect(validated.rows[3]?.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('duplicated'),
        expect.stringContaining('YYYY-MM-DD'),
      ]),
    );
    const committed = await data<{
      creates: number;
      errors: number;
      rows: { status: string; id?: string }[];
    }>(await step('devices', 'commit', devicesCsv));
    expect(committed.creates).toBe(2);
    expect(committed.rows[0]?.status).toBe('created');
    // A second run of the same file updates the matched rows instead of duplicating them.
    const again = await data<{ updates: number; creates: number }>(
      await step('devices', 'validate', devicesCsv),
    );
    expect(again.updates).toBe(2);
    expect(again.creates).toBe(0);
    expect(
      (await step('devices', 'commit', devicesCsv, undefined)).status,
    ).toBe(200);
    expect((await get('devices?q=SN-')).status).toBe(200);
    expect(
      ((await (await get('devices')).json()) as { total: number }).total,
    ).toBe(2);

    const exported = await get(
      'exports/devices?filter[status]=inStock&columns=deviceNo,serialNo,purchasePrice',
    );
    expect(exported.status).toBe(200);
    const text = await exported.text();
    expect(text).toContain('AS-100');
    expect(text).toContain('12000');
    // References export as names, the way the pages and an import read them.
    const withModel = await (
      await get('exports/devices?columns=deviceNo,modelId,locationId')
    ).text();
    expect(withModel).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
    // Employees export nothing they cannot read.
    expect((await get('exports/devices', employee)).status).toBe(403);
    expect(
      (await post('imports/devices/commit', { csv: devicesCsv }, employee))
        .status,
    ).toBe(403);
  });

  it('imports purchase orders as documents, one order per order number', async () => {
    const step = (collection: string, name: string, csv: string) =>
      post(`imports/${collection}/${name}`, { csv });
    await step('manufacturers', 'commit', 'Name\nDemo Lenovo\n');
    await step(
      'categories',
      'commit',
      [
        'name,appliesTo,requiresSerial',
        'Laptop,device,yes',
        'Dock,accessory,no',
      ].join('\n'),
    );
    await step(
      'models',
      'commit',
      [
        'Model,Category,Brand',
        'T14,Laptop,Demo Lenovo',
        'USB-C Dock,Dock,Demo Lenovo',
      ].join('\n'),
    );
    await step('vendors', 'commit', 'name,types\nDemo Supplier,equipment\n');

    const csv = [
      'Order No,reason,vendor,expectedAt,itemType,model,qty,price',
      'PO-A,newHire,Demo Supplier,2026-10-01,device,T14,2,9000',
      'PO-A,newHire,,,accessory,USB-C Dock,2,600',
      'PO-B,project,Demo Supplier,,device,T14,1,12000',
    ].join('\n');
    const preview = await data<{
      groupBy?: string;
      mapping: Record<string, string>;
    }>(await step('purchaseOrders', 'preview', csv));
    // The wizard is told the rows group, and the columns map by their aliases.
    expect(preview.groupBy).toBe('orderKey');
    expect(preview.mapping).toMatchObject({
      orderKey: 'Order No',
      itemType: 'itemType',
      quantity: 'qty',
      unitPrice: 'price',
    });

    const committed = await data<{
      creates: number;
      errors: number;
      rows: { line: number; status: string; id?: string }[];
    }>(await step('purchaseOrders', 'commit', csv));
    expect(committed.errors).toBe(0);
    // Every row is a line, and the two rows of PO-A land on one order.
    expect(committed.rows.map((row) => row.status)).toEqual([
      'created',
      'created',
      'created',
    ]);
    expect(committed.rows[0]?.id).toBe(committed.rows[1]?.id);
    expect(committed.rows[2]?.id).not.toBe(committed.rows[0]?.id);

    const orders = await data<
      { id: string; status: string; orderNo: string }[]
    >(await get('purchase-orders?sort=createdAt&order=asc'));
    expect(orders).toHaveLength(2);
    // The application numbers the orders itself; the file's key only grouped them.
    expect(orders[0]?.orderNo).not.toBe('PO-A');
    expect(orders[0]?.status).toBe('draft');
    const first = await data<{ estimatedTotal: unknown }>(
      await get(`purchase-orders/${committed.rows[0]?.id}`),
    );
    expect(Number(first.estimatedTotal)).toBe(2 * 9000 + 2 * 600);
    const lines = await data<{ quantity: number }[]>(
      await get(`purchase-orders/${committed.rows[0]?.id}/lines`),
    );
    expect(lines).toHaveLength(2);

    // A row that contradicts its order fails, and takes the whole order with
    // it: an order missing one of its lines is wrong in a way nobody sees.
    const conflicting = [
      'Order No,reason,itemType,model,qty',
      'PO-C,newHire,device,T14,1',
      'PO-C,project,device,T14,1',
      'PO-D,other,device,T14,not-a-number',
    ].join('\n');
    const validated = await data<{
      errors: number;
      rows: { line: number; errors: string[] }[];
    }>(await step('purchaseOrders', 'validate', conflicting));
    expect(validated.errors).toBe(3);
    expect(validated.rows[1]?.errors[0]).toContain('reason');
    expect(validated.rows[0]?.errors[0]).toContain('not imported');
    expect(validated.rows[2]?.errors[0]).toContain('quantity');
    expect(
      ((await (await get('purchase-orders')).json()) as { total: number })
        .total,
    ).toBe(2);

    // A line the order service refuses (an accessory line on a laptop model)
    // passes validation and fails only when the lines are written. The order
    // created just before is removed again, so the group leaves nothing
    // behind, while the next group still lands.
    const mismatched = [
      'Order No,reason,itemType,model,qty',
      'PO-E,newHire,device,T14,1',
      'PO-E,newHire,accessory,T14,1',
      'PO-F,project,accessory,USB-C Dock,3',
    ].join('\n');
    const partial = await data<{
      errors: number;
      rows: { line: number; status: string; errors?: string[] }[];
    }>(await step('purchaseOrders', 'commit', mismatched));
    expect(partial.rows.map((row) => row.status)).toEqual([
      'error',
      'error',
      'created',
    ]);
    expect(partial.rows[1]?.errors?.[0]).toContain("model's category");
    const after = await data<{ id: string }[]>(await get('purchase-orders'));
    expect(after).toHaveLength(3);
    expect(after.map((order) => order.id)).toContain(partial.rows[2]?.id);
  });

  it('shows the demo’s platforms as connected and syncs them from the demo', async () => {
    expect((await generateDemo({ language: 'zh-CN' })).status).toBe(200);
    const connections = app.container.resolve(deviceConnectionsServiceToken);
    expect(
      (await connections.describe()).map((row) => [row.source, row.origin]),
    ).toEqual([
      ['intune', 'demo'],
      ['jamf', 'demo'],
    ]);
    const sync = app.container.resolve(deviceSyncServiceToken);
    expect(
      (await sync.status()).map((source) => [source.key, source.configured]),
    ).toEqual([
      ['intune', true],
      ['jamf', true],
    ]);
    const query = () => app.container.resolve(databaseManagerToken).query();
    const before = (await query()
      .selectFrom('managedDevices')
      .select(['externalId', 'lastSyncAt', 'goneAt'])
      .execute()) as {
      externalId: string;
      lastSyncAt: string;
      goneAt: string | null;
    }[];
    const runs = await sync.runAll('manual');
    expect(runs.map((run) => [run.source, run.status])).toEqual([
      ['intune', 'succeeded'],
      ['jamf', 'succeeded'],
    ]);
    const after = new Map(
      (
        (await query()
          .selectFrom('managedDevices')
          .select(['externalId', 'lastSyncAt', 'goneAt'])
          .execute()) as typeof before
      ).map((row) => [row.externalId, row]),
    );
    // The record Intune dropped stays gone; the rest sync no earlier.
    expect(before.filter((row) => row.goneAt)).toHaveLength(1);
    for (const row of before) {
      expect(Boolean(after.get(row.externalId)?.goneAt)).toBe(
        Boolean(row.goneAt),
      );
      if (!row.goneAt)
        expect(
          Date.parse(after.get(row.externalId)!.lastSyncAt),
        ).toBeGreaterThanOrEqual(Date.parse(row.lastSyncAt));
    }
    // Made-up ids open no console page.
    expect((await sync.consoleUrls())('intune', 'demo-build-vm')).toBeNull();
  });

  it('generates the demo in the language asked for', async () => {
    expect((await post('demo/generate', { language: 'fr-FR' })).status).toBe(
      400,
    );
    const summary = await data<{ language: string | null }>(
      await generateDemo({ language: 'zh-CN' }),
    );
    expect(summary.language).toBe('zh-CN');
    const people = await data<
      { name: string; employmentStatus: string; leaveDate: string | null }[]
    >(await get('master/people?pageSize=50'));
    // 陈杰 left two days before the demo was imported, so the 离职交接
    // to-do has a whole handover to show and their laptop's syncs since
    // read as 离职后仍在线 (2026-10-22; it was the day itself).
    expect(people.find((person) => person.name === '陈杰')).toMatchObject({
      employmentStatus: 'left',
      leaveDate: addDays(today(), -2),
    });
  });

  it('reports how far an import has got while it runs, and runs one at a time', async () => {
    type Status = {
      generated: boolean;
      importing: { percent: number } | null;
    };
    const started = await post('demo/generate', { language: 'en-US' });
    // Under way as soon as the request is answered.
    expect((await data<Status>(started)).importing).toEqual({ percent: 0 });
    let status = await data<Status>(await get('demo'));
    for (let tries = 0; !status.importing && tries < 50; tries += 1) {
      await new Promise((done) => setTimeout(done, 5));
      status = await data<Status>(await get('demo'));
    }
    expect(status.importing?.percent).toBeGreaterThanOrEqual(0);
    expect(status.importing?.percent).toBeLessThanOrEqual(100);
    // A second import is refused while the first runs.
    expect((await post('demo/generate', { language: 'en-US' })).status).toBe(
      422,
    );
    while (status.importing) {
      await new Promise((done) => setTimeout(done, 20));
      status = await data<Status>(await get('demo'));
    }
    expect(status).toMatchObject({ generated: true, importing: null });
  });

  it('fills an empty default kit rather than adding a second one', async () => {
    // 设置本部门默认配置 on a department with nothing above it to copy.
    const empty = await data<{ id: string }>(
      await post('master/onboardingKits', {
        name: 'Technology default kit',
        departmentId: 'dept-tech',
        items: [],
      }),
    );
    expect((await generateDemo()).status).toBe(200);
    const kits = async () =>
      (
        (await (await get('master/onboardingKits?pageSize=200')).json()) as {
          data: {
            id: string;
            departmentId: string;
            position: string | null;
            items: unknown[];
          }[];
        }
      ).data.filter((kit) => kit.departmentId === 'dept-tech' && !kit.position);
    const imported = await kits();
    expect(imported.map((kit) => kit.id)).toEqual([empty.id]);
    expect(imported[0]?.items.length).toBeGreaterThan(0);
    // It is the user's kit, not the demo's: clearing leaves it.
    expect((await post('demo/clear')).status).toBe(200);
    expect((await kits()).map((kit) => kit.id)).toEqual([empty.id]);
  });

  it('clears the orders raised for its joiners, and leaves a real joiner’s', async () => {
    expect((await generateDemo()).status).toBe(200);
    const people = await data<
      {
        id: string;
        name: string;
        departmentId: string;
        hireDate: string | null;
      }[]
    >(await get('master/people?pageSize=100'));
    const noah = people.find((person) => person.name === 'Noah Harris')!;
    const [vendor] = await data<{ id: string }[]>(
      await get('master/vendors?pageSize=1'),
    );
    // 起草采购单 for the demo joiner, and an order of the user's for
    // somebody real starting the same day in the same department.
    const order = async (name: string) =>
      data<{ id: string }>(
        await post('purchase-orders', {
          reason: 'newHire',
          description: `New hire kit: ${name}, joining ${noah.hireDate!}`,
          departmentId: noah.departmentId,
          neededBy: noah.hireDate,
          vendorId: vendor!.id,
        }),
      );
    const demoJoiner = await order('Noah Harris');
    const realJoiner = await order('Real Person');
    expect((await post('demo/clear')).status).toBe(200);
    expect((await get(`purchase-orders/${demoJoiner.id}`)).status).toBe(404);
    expect((await get(`purchase-orders/${realJoiner.id}`)).status).toBe(200);
  });

  it('generates the demo chain with its problem records and clears it without a trace', async () => {
    const generated = await generateDemo();
    expect(generated.status).toBe(200);
    const summary = await data<{
      generated: boolean;
      counts: Record<string, number>;
    }>(generated);
    expect(summary.generated).toBe(true);
    expect(summary.counts.devices).toBeGreaterThanOrEqual(12);
    // Every model has its part code, the demo's own too (2026-10-20); a
    // picture only where there is a photo of it (2026-10-21).
    const models = (await (await get('master/models?pageSize=200')).json()) as {
      data: {
        id: string;
        name: string;
        code: string | null;
        imageFileId: string | null;
      }[];
    };
    expect(
      models.data.filter((model) => !model.code).map((model) => model.name),
    ).toEqual(['vSphere VM']);
    expect(
      models.data.filter((model) => model.imageFileId).length,
    ).toBeGreaterThanOrEqual(15);
    // Every model has something on the books, devices or stock (2026-10-21).
    const devicesNow = (await (await get('devices?pageSize=500')).json()) as {
      data: { modelId: string }[];
    };
    const stockNow = (await (await get('stock?pageSize=500')).json()) as {
      data: { modelId: string | null }[];
    };
    const used = new Set([
      ...devicesNow.data.map((row) => row.modelId),
      ...stockNow.data.map((row) => row.modelId),
    ]);
    expect(
      models.data
        .filter((model) => !used.has(model.id))
        .map((model) => model.name),
    ).toEqual([]);
    // A real address book (2026-10-21): nine vendors, and the Macs came
    // through the Apple reseller.
    const vendors = await data<{ id: string; name: string }[]>(
      await get('master/vendors?pageSize=50'),
    );
    expect(vendors.length).toBeGreaterThanOrEqual(9);
    const appleReseller = vendors.find((vendor) =>
      vendor.name.includes('Apple'),
    );
    expect(appleReseller).toBeDefined();
    const macOrders = await data<{ vendorId: string }[]>(
      await get(`purchase-orders?filter[vendorId]=${appleReseller?.id ?? ''}`),
    );
    expect(macOrders.length).toBeGreaterThan(0);
    expect(
      macOrders.every((order) => order.vendorId === appleReseller?.id),
    ).toBe(true);
    // A photo carries the credit its license asks for.
    const credits = (await (
      await get('master/models?pageSize=200')
    ).json()) as { data: { name: string; imageCredit: string | null }[] };
    expect(
      credits.data.find((model) => model.name === 'Galaxy S24')?.imageCredit,
    ).toContain('CC BY-SA 4.0');
    // Every department has a default 入职配置, 技术部 included, which the
    // seeds leave without one.
    const kits = (await (
      await get('master/onboardingKits?pageSize=200')
    ).json()) as {
      data: { departmentId: string; position: string | null }[];
    };
    const withDefault = new Set(
      kits.data.filter((kit) => !kit.position).map((kit) => kit.departmentId),
    );
    const departments = (await (
      await get('master/departments?pageSize=200')
    ).json()) as { data: { id: string }[] };
    expect(departments.data.length).toBeGreaterThan(0);
    for (const department of departments.data)
      expect(withDefault).toContain(department.id);
    // Without a language it follows the deployment's (en-US in tests), and
    // the status says when and how much; this harness creates no sign-ins.
    const status = await data<{
      records: number;
      createdAt: string | null;
      language: string | null;
      accounts: unknown[];
      accountsByLanguage: Record<string, { username: string }[]>;
    }>(await get('demo'));
    expect(status.language).toBe('en-US');
    expect(status.records).toBe(
      Object.values(summary.counts).reduce((sum, n) => sum + n, 0),
    );
    expect(status.createdAt).not.toBeNull();
    expect(status.accounts).toEqual([]);
    expect(
      status.accountsByLanguage['zh-CN']?.map((account) => account.username),
    ).toEqual(['sunqiang', 'wujing', 'zhouyu', 'chenjie']);
    // The English demo's IT people are English names, not the Chinese ones
    // romanised, and so are their sign-ins.
    expect(
      status.accountsByLanguage['en-US']?.map((account) => account.username),
    ).toEqual(['daniel', 'emily', 'ryan', 'mark']);
    const laptops = await data<{ attributes: Record<string, unknown> }[]>(
      await get('devices?q=SH-LT-00&pageSize=5'),
    );
    expect(laptops.length).toBeGreaterThan(0);
    expect(laptops[0]?.attributes.os).toBe('macOS 15.6');
    // A new device starts with its model's extended fields (2026-10-06):
    // the screen size was filled on the model, the upgraded Latitude
    // states its own processor.
    expect(laptops[0]?.attributes.screenSize).toBe('14');
    const upgraded = await data<{ attributes: Record<string, unknown> }[]>(
      await get('devices?q=SH-LT-007&pageSize=1'),
    );
    expect(upgraded[0]?.attributes.memory).toBe('32 GB');
    expect(upgraded[0]?.attributes.cpu).toBe('Intel Core i7-1355U');
    expect((await post('demo/generate')).status).toBe(422);
    expect((await post('demo/generate', {}, employee)).status).toBe(403);

    // The demo's Intune (device sync, 2026-10-14) went through the real
    // matching: the laptops and desktops in use are linked by serial, and
    // three of its devices are not on the books — one an employee's own.
    const managed = (await app.container
      .resolve(databaseManagerToken)
      .query()
      .selectFrom('managedDevices')
      .select([
        'externalId',
        'matchState',
        'ownership',
        'lastSyncAt',
        'goneAt',
        'ignoreReason',
      ])
      .execute()) as {
      externalId: string;
      matchState: string;
      ownership: string;
      lastSyncAt: string;
      goneAt: string | null;
      ignoreReason: string | null;
    }[];
    // Whatever the hour it is imported, no sync is dated in the future.
    expect(
      managed.filter((row) => Date.parse(row.lastSyncAt) > Date.now()),
    ).toEqual([]);
    expect(
      managed.filter((row) => row.matchState === 'linked').length,
    ).toBeGreaterThanOrEqual(4);
    expect(
      managed
        .filter((row) => row.matchState !== 'linked')
        .map((row) => row.externalId)
        .sort(),
    ).toEqual([
      'demo-board-swap',
      'demo-build-vm',
      'demo-contractor-laptop',
      'demo-meeting-room',
      'demo-newcomer-laptop',
      'demo-personal-phone',
      'demo-unregistered-laptop',
    ]);
    const record = (externalId: string) =>
      managed.find((row) => row.externalId === externalId);
    expect(record('demo-personal-phone')?.ownership).toBe('personal');
    // A company account that is no person on the register (2026-10-21).
    expect(record('demo-newcomer-laptop')).toMatchObject({
      matchState: 'unlinked',
    });
    // 2026-10-15: every situation of MDM 核对 — a record a person kept off
    // the register with a reason, and one Intune stopped reporting on the
    // second pull. (A serial two devices share went on 2026-10-16: the
    // register no longer takes the same serial twice.)
    expect(record('demo-meeting-room')).toMatchObject({
      matchState: 'ignored',
      ignoreReason: expect.stringMatching(/\S/),
    });
    expect(managed.filter((row) => row.goneAt)).toHaveLength(1);

    const reminders = await app.container
      .resolve(maintenanceServiceToken)
      .reminderCounts();
    const count = (kind: string) =>
      reminders.find((entry) => entry.kind === kind)?.count ?? 0;
    expect(count('warrantyExpiring')).toBeGreaterThanOrEqual(4);
    expect(count('idleDevice')).toBeGreaterThanOrEqual(1);
    expect(count('entitlementOverAllocated')).toBe(1);
    // Every status has a device (2026-10-22): a spare phone is retired.
    const statuses = await app.container
      .resolve(databaseManagerToken)
      .query()
      .selectFrom('devices')
      .select('status')
      .execute<{ status: string }>();
    expect(new Set(statuses.map((row) => row.status))).toEqual(
      new Set([
        'inStock',
        'inUse',
        'onLoan',
        'inRepair',
        'retired',
        'pendingDisposal',
        'disposed',
        'lost',
      ]),
    );
    // And every way a repair ends (2026-10-23).
    const results = await app.container
      .resolve(databaseManagerToken)
      .query()
      .selectFrom('repairs')
      .select('result')
      .execute<{ result: string }>();
    expect(new Set(results.map((row) => row.result))).toEqual(
      new Set([
        'inProgress',
        'repaired',
        'unrepairable',
        'replaced',
        'cancelled',
        'scrapped',
      ]),
    );
    // Every rule has something to show (2026-10-22): one below its minimum
    // of each kind kept as a quantity, and a device filed under another
    // department than its holder's.
    expect(count('lowAccessories')).toBe(1);
    expect(count('lowConsumables')).toBe(1);
    expect(count('lowComponents')).toBe(1);
    expect(count('departmentMismatch')).toBeGreaterThanOrEqual(1);
    // The demo's overdue loan is a to-do card and a notification, not a
    // reminder, since 2026-09-28; its leaver became a to-do the same way,
    // scoped to whoever is responsible for what they still hold.
    expect(count('loanOverdue')).toBe(0);
    expect(count('leftPersonHoldings')).toBe(0);
    expect(count('auditOverdue')).toBeGreaterThanOrEqual(4);
    // The Zoom subscription the demo stopped renewing still holds a seat.
    expect(count('entitlementEnded')).toBe(1);
    // The engineer's IntelliJ seat, past its last day to order (2026-10-22).
    expect(count('onboardingOrderOverdue')).toBe(1);
    // Step 2 (2026-10-15): the demo shows every kind of difference — one
    // silent, one under another user, one on the shelf yet online — and the
    // other two tabs: the laptops and the VM not on the register (the
    // personal phone is ignored), and the laptops in use on no platform.
    // The devices on the books before ITAM came in on completed orders of
    // their own (2026-10-16): nearly every device names one, and each such
    // order lists its devices through its receipts.
    const db = app.container.resolve(databaseManagerToken).query();
    const withOrder = await db
      .selectFrom('devices')
      .select(['id', 'purchaseOrderId'])
      .execute<{ id: string; purchaseOrderId: string | null }>();
    const ordered = withOrder.filter((row) => row.purchaseOrderId);
    expect(ordered.length / withOrder.length).toBeGreaterThan(0.8);
    const receipts = await db
      .selectFrom('purchaseReceipts')
      .select('generatedId')
      .where('generatedType', '=', 'device')
      .execute<{ generatedId: string }>();
    expect(new Set(receipts.map((row) => row.generatedId))).toEqual(
      new Set(ordered.map((row) => row.id)),
    );
    const review = app.container.resolve(deviceReviewServiceToken);
    const checks = await review.checks();
    expect(new Set(checks.map((check) => check.kind))).toEqual(
      new Set(['stale', 'userMismatch', 'statusMismatch']),
    );
    // The disposed laptop still online is the critical one.
    expect(checks.some((check) => check.critical)).toBe(true);
    // The computers on the shelf or at the repairer are on Intune too, with
    // a sync weeks back (2026-10-16): linked, yet no 状态不符 — only the
    // shelved ones syncing daily (one under a person, to 分配给), the one
    // found after it was lost (恢复为库存中) and the disposed one are
    // (2026-10-22).
    const resting = await app.container
      .resolve(databaseManagerToken)
      .query()
      .selectFrom('managedDevices')
      .innerJoin('devices', 'devices.id', 'managedDevices.deviceId')
      .select(['devices.id as id'])
      .where('managedDevices.matchState', '=', 'linked')
      .where('devices.status', 'in', ['inStock', 'inRepair'])
      .execute<{ id: string }>();
    expect(resting.length).toBeGreaterThan(2);
    const mismatched = checks.filter(
      (check) => check.kind === 'statusMismatch',
    );
    expect(mismatched).toHaveLength(4);
    expect(
      mismatched.some((check) => check.status === 'inStock' && check.personId),
    ).toBe(true);
    // Found in a person's hands: restored, then handed to them.
    expect(
      mismatched.some((check) => check.status === 'lost' && check.personId),
    ).toBe(true);
    // The new laptop, the newcomer's, the contractor's, the VM and the
    // desktop with a new board.
    const unregistered = await review.unregistered();
    expect(unregistered).toHaveLength(5);
    // The desktop with a new board names its register device (2026-10-22).
    expect(
      unregistered.find((row) => row.serialNo === 'MJ0K90Q4B7')
        ?.sameNameDevices,
    ).toEqual([
      expect.objectContaining({ name: 'SH-DT-202', serialNo: 'MJ0K90Q4A1' }),
    ]);
    expect((await review.unmanaged()).length).toBeGreaterThanOrEqual(1);
    // A test phone marked 不需要纳管, with its reason (2026-10-15).
    expect(await review.exempted()).toHaveLength(1);
    // Step 3: the demo's Jamf reports the Macs and phones in use, each
    // linked to the register device of its serial.
    const jamf = (await app.container
      .resolve(databaseManagerToken)
      .query()
      .selectFrom('managedDevices')
      .select(['externalId', 'matchState'])
      .where('source', '=', 'jamf')
      .execute()) as { externalId: string; matchState: string }[];
    expect(jamf.some((row) => row.externalId.startsWith('computer:'))).toBe(
      true,
    );
    expect(jamf.some((row) => row.externalId.startsWith('mobile:'))).toBe(true);
    expect(jamf.every((row) => row.matchState === 'linked')).toBe(true);

    // The people list's holding counts agree with each person's stats.
    const people = await data<
      { id: string; name: string; employeeNo: string }[]
    >(await get('master/people?pageSize=50'));
    const holdingCounts = await data<Record<string, Record<string, number>>>(
      await get('master/people/counts'),
    );
    const liNa = people.find(
      (person) =>
        person.name === 'Olivia Bennett' && person.employeeNo === 'EMP-101',
    );
    expect(liNa).toBeDefined();
    const stats = await data<{ counts: Record<string, number> }>(
      await get(`master/people/${liNa!.id}/stats`),
    );
    // Her kit's laptop and monitor; its dock, keyboard and mouse; IntelliJ,
    // Microsoft 365 and Zoom, and the Figma seat she has besides
    // (2026-10-16: equipped to the R&D kit).
    expect(stats.counts.devices).toBe(2);
    expect(stats.counts.accessories).toBe(3);
    expect(stats.counts.entitlements).toBe(4);
    expect(stats.counts.holdings).toBe(9);
    expect(holdingCounts.devices?.[liNa!.id]).toBe(2);
    expect(holdingCounts.accessories?.[liNa!.id]).toBe(3);
    expect(holdingCounts.entitlements?.[liNa!.id]).toBe(4);

    // A company rather than a team of twelve (2026-10-16), and everybody
    // there holds what their 入职配置 asks: 入职准备 lists only the two
    // joining next week.
    expect(people.length).toBeGreaterThanOrEqual(35);
    const pendingOnboarding = (
      await data<
        {
          key: string;
          count: number;
          records: {
            title: string;
            shortfall?: number;
            orderOverdue?: boolean;
          }[];
        }[]
      >(await get('workbench/my-work'))
    ).find((item) => item.key === 'pendingOnboarding');
    expect(pendingOnboarding?.count).toBe(2);
    expect(pendingOnboarding?.records.map((record) => record.title)).toEqual([
      'Noah Harris',
      'Grace Lee',
    ]);
    // The card says what is short, and that its last order day has passed.
    expect(pendingOnboarding?.records[0]).toMatchObject({
      shortfall: 1,
      orderOverdue: true,
    });
    // The joiners show each way a joiner is equipped (2026-10-22): from
    // stock, from an order on its way (the designer's Adobe seat) and short
    // (the engineer's IntelliJ seat, no seat spare and none on order, and
    // the designer's test iPhone).
    const planOf = async (name: string) => {
      const person = people.find((row) => row.name === name)!;
      return data<{
        lines: {
          target: { name: string };
          shortfall: number;
          onOrder: number;
        }[];
      }>(await get(`master/people/${person.id}/onboarding`));
    };
    const short = (plan: Awaited<ReturnType<typeof planOf>>) =>
      plan.lines
        .filter((line) => line.shortfall > 0)
        .map((line) => line.target.name);
    expect(short(await planOf('Noah Harris'))).toEqual([
      'IntelliJ IDEA Ultimate',
    ]);
    const grace = await planOf('Grace Lee');
    // The interaction designer's test phone (2026-10-22): none in stock.
    expect(short(grace)).toEqual(['iPhone 15']);
    expect(grace.lines.some((line) => line.onOrder > 0)).toBe(true);

    // One placed order carries every kind of line, so receiving it shows
    // every way goods arrive: the placed order with the most kinds of line.
    const placed = await data<{ id: string; orderNo: string }[]>(
      await get('purchase-orders?filter[status]=ordered&pageSize=50'),
    );
    const kindsOf = async (orderId: string) =>
      (
        await data<{ itemType: string }[]>(
          await get(`purchase-orders/${orderId}/lines`),
        )
      ).map((line) => line.itemType);
    let mixedLines: { itemType: string }[] = [];
    for (const order of placed) {
      const kinds = await kindsOf(order.id);
      if (kinds.length > mixedLines.length)
        mixedLines = kinds.map((itemType) => ({ itemType }));
    }
    expect(mixedLines.map((line) => line.itemType).sort()).toEqual([
      'accessory',
      'component',
      'consumable',
      'device',
      'perpetual',
      'subscription',
    ]);

    // More than devices (2026-10-16): nine accessories, five consumables and
    // five components, three perpetual licences and seven subscriptions.
    // Every place without places under it holds something (2026-10-21):
    // devices, people or stock, a meeting room and a Tokyo office among them.
    const locationRows = await db
      .selectFrom('locations')
      .select(['id', 'name', 'parentId'])
      .execute<{ id: string; name: string; parentId: string | null }>();
    expect(locationRows.length).toBeGreaterThanOrEqual(8);
    const parents = new Set(locationRows.map((row) => row.parentId));
    const holding = new Set<string>();
    for (const table of ['devices', 'people'] as const)
      for (const row of await db
        .selectFrom(table)
        .select(['locationId'])
        .execute<{ locationId: string | null }>())
        if (row.locationId) holding.add(row.locationId);
    for (const row of await db
      .selectFrom('stockItems')
      .select(['locationId'])
      .execute<{ locationId: string | null }>())
      if (row.locationId) holding.add(row.locationId);
    expect(
      locationRows
        .filter((row) => !parents.has(row.id) && !holding.has(row.id))
        .map((row) => row.name),
    ).toEqual([]);
    // Every demo vendor has dealt with the company (2026-10-21): an order,
    // a repair or a disposal, none an empty entry in the address book.
    const vendorRows = await db
      .selectFrom('vendors')
      .select(['id', 'name'])
      .execute<{ id: string; name: string }>();
    const dealtWith = new Set<string>();
    for (const [table, column] of [
      ['purchaseOrders', 'vendorId'],
      ['repairs', 'vendorId'],
      ['disposals', 'recipientVendorId'],
    ] as const)
      for (const row of await db
        .selectFrom(table)
        .select([column])
        .execute<Record<string, string | null>>())
        if (row[column]) dealtWith.add(String(row[column]));
    expect(
      vendorRows
        .filter((vendor) => !dealtWith.has(vendor.id))
        .map((vendor) => vendor.name),
    ).toEqual([]);
    const kindsOfStock = await db
      .selectFrom('stockItems')
      .select(['id', 'kind', 'name', 'totalQuantity', 'usedQuantity'])
      .execute<{
        id: string;
        kind: string;
        name: string;
        totalQuantity: number;
        usedQuantity: number;
      }>();
    const countBy = (values: string[]) =>
      values.reduce<Record<string, number>>(
        (counts, value) => ({ ...counts, [value]: (counts[value] ?? 0) + 1 }),
        {},
      );
    // With the catalogue's three accessories and a component (2026-10-21).
    expect(countBy(kindsOfStock.map((row) => row.kind))).toEqual({
      accessory: 9,
      consumable: 5,
      component: 5,
    });
    const licences = await db
      .selectFrom('entitlements')
      .select(['id', 'kind', 'name'])
      .execute<{ id: string; kind: string; name: string }>();
    expect(countBy(licences.map((row) => row.kind))).toEqual({
      perpetual: 3,
      subscription: 7,
    });
    // Every stock item has a story of several movements, and read in date
    // order they never take more out than was there and add up to what the
    // item holds: the dates moved, the order did not.
    const movements = await db
      .selectFrom('stockMovements')
      .select(['stockItemId', 'type', 'quantity', 'createdAt'])
      .orderBy('createdAt', 'asc')
      .execute<{
        stockItemId: string;
        type: string;
        quantity: number;
        createdAt: string;
      }>();
    const SIGN: Record<string, number> = {
      in: 1,
      adjust: 1,
      return: 1,
      uninstall: 1,
      issue: -1,
      consume: -1,
      install: -1,
    };
    const unlikely: string[] = [];
    for (const item of kindsOfStock) {
      const own = movements.filter((row) => row.stockItemId === item.id);
      if (own.length < 3)
        unlikely.push(`${item.name}: ${own.length} movements`);
      let onHand = 0;
      for (const row of own) {
        onHand += (SIGN[row.type] ?? 0) * Number(row.quantity);
        if (onHand < 0)
          unlikely.push(`${item.name}: negative at ${row.createdAt}`);
      }
      if (onHand !== Number(item.totalQuantity) - Number(item.usedQuantity))
        unlikely.push(`${item.name}: ends at ${onHand}`);
      // Stocked a year or more ago, used since.
      if (new Set(own.map((row) => row.createdAt.slice(0, 10))).size < 3)
        unlikely.push(`${item.name}: all on one or two days`);
    }
    expect(unlikely).toEqual([]);
    // Nobody holds two accessories of a kind (2026-10-22): 张伟 held two
    // docks, two keyboards and two mice.
    const held = await db
      .selectFrom('stockHoldings')
      .innerJoin('stockItems', 'stockItems.id', 'stockHoldings.stockItemId')
      .select(['stockHoldings.holderId', 'stockItems.categoryId'])
      .where('stockHoldings.holderType', '=', 'person')
      .where('stockHoldings.quantity', '>', 0)
      .where('stockItems.kind', '=', 'accessory')
      .execute<{ holderId: string; categoryId: string }>();
    const pairs = held.map((row) => `${row.holderId}:${row.categoryId}`);
    expect(pairs.length).toBe(new Set(pairs).size);
    // The history runs over years, not one afternoon: a laptop of the 2023
    // batch was entered three years back, and nothing is dated ahead.
    const history = await db
      .selectFrom('historyEvents')
      .select(['subjectId', 'type', 'createdAt'])
      .execute<{ subjectId: string; type: string; createdAt: string }>();
    expect(
      history.filter((row) => Date.parse(row.createdAt) > Date.now()),
    ).toEqual([]);
    expect(
      new Set(history.map((row) => row.createdAt.slice(0, 10))).size,
    ).toBeGreaterThan(60);
    const oldLaptop = await data<{ id: string }[]>(
      await get('devices?q=SH-LT-003&pageSize=1'),
    );
    const laptopHistory = history
      .filter((row) => row.subjectId === oldLaptop[0]?.id)
      .map((row) => row.createdAt)
      .sort();
    expect(Date.parse(laptopHistory[0]!)).toBeLessThan(
      Date.now() - 1000 * 86_400_000,
    );
    expect(
      new Set(laptopHistory.map((at) => at.slice(0, 7))).size,
    ).toBeGreaterThanOrEqual(5);
    // It changed hands: returned by one person, assigned to another.
    expect(
      history.filter(
        (row) => row.subjectId === oldLaptop[0]?.id && row.type === 'assign',
      ),
    ).toHaveLength(2);
    // Seats were taken back and given to somebody else on a later day.
    const seats = await db
      .selectFrom('entitlementSeats')
      .select(['entitlementId', 'assignedAt', 'releasedAt'])
      .execute<{
        entitlementId: string;
        assignedAt: string;
        releasedAt: string | null;
      }>();
    const reassigned = licences.filter((licence) => {
      const own = seats.filter((seat) => seat.entitlementId === licence.id);
      return own.some(
        (released) =>
          released.releasedAt &&
          own.some(
            (next) =>
              !next.releasedAt && next.assignedAt > released.releasedAt!,
          ),
      );
    });
    expect(reassigned.length).toBeGreaterThanOrEqual(2);

    // An agent's suggestion on one of its requests goes with it too.
    const database = app.container.resolve(databaseManagerToken);
    const order = await database
      .query()
      .selectFrom('purchaseOrders')
      .select('id')
      .executeTakeFirstOrThrow<{ id: string }>();
    await database
      .query()
      .insertInto('itamAgentRuns')
      .values({
        id: 'demo-run',
        agent: 'approvalReview',
        trigger: 'event',
        subjectType: 'purchaseOrders',
        subjectId: order.id,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .execute();
    // A device someone registered from one of its platform records goes
    // with it too (2026-10-21): left behind, the next import's record
    // linked to it and 只在 MDM never showed it again.
    const place = await database
      .query()
      .selectFrom('locations')
      .select('id')
      .executeTakeFirstOrThrow<{ id: string }>();
    expect(
      (
        await post('devices', {
          modelId: 'model-thinkpad-t14-gen5',
          locationId: place.id,
          serialNo: 'PF5DEMO01',
        })
      ).status,
    ).toBe(201);
    // What it wrote on records it did not make, toner issued to a seeded
    // floor (2026-10-21), goes with it rather than staying on that record
    // under an account the next import replaces.
    const onSeeded = () =>
      database
        .query()
        .selectFrom('historyEvents')
        .select('id')
        .where('subjectType', '=', 'locations')
        .where('sourceType', '=', 'demo')
        .execute();
    expect((await onSeeded()).length).toBeGreaterThan(0);
    const cleared = await data<{ generated: boolean }>(
      await post('demo/clear'),
    );
    expect(await onSeeded()).toEqual([]);
    expect(
      await database
        .query()
        .selectFrom('devices')
        .select('id')
        .where('serialNo', '=', 'PF5DEMO01')
        .execute(),
    ).toHaveLength(0);
    // Its stock, movements, seats and the master data it added went with it.
    for (const table of [
      'stockItems',
      'stockMovements',
      'stockHoldings',
      'entitlementSeats',
      'itamAgentRuns',
      // The lifecycle log of its disposals (2026-10-18).
      'lifecycleTransitions',
      'lifecycleEffectRuns',
    ])
      expect(
        (
          await app.container
            .resolve(databaseManagerToken)
            .query()
            .selectFrom(table)
            .select(['id'])
            .execute()
        ).map(() => table),
      ).toEqual([]);
    for (const [table, name] of [
      ['categories', 'Webcam'],
      ['manufacturers', 'Duracell'],
    ] as const)
      expect(
        await app.container
          .resolve(databaseManagerToken)
          .query()
          .selectFrom(table)
          .select(['id'])
          .where('name', '=', name)
          .execute(),
      ).toEqual([]);
    expect(cleared.generated).toBe(false);
    for (const table of ['managedDevices', 'deviceSyncRuns'])
      expect(
        await app.container
          .resolve(databaseManagerToken)
          .query()
          .selectFrom(table)
          .select(['id'])
          .execute(),
      ).toEqual([]);
    for (const collection of ['devices', 'entitlements'])
      expect(
        ((await (await get(collection)).json()) as { total: number }).total,
      ).toBe(0);
    // The seeded first employee stays; only the demo people went.
    expect(
      ((await (await get('master/people')).json()) as { total: number }).total,
    ).toBe(1);
    // The default kit the demo added for 技术部 went with it; the seeded
    // ones stay.
    const kitsAfter = (await (
      await get('master/onboardingKits?pageSize=200')
    ).json()) as { data: { departmentId: string; position: string | null }[] };
    expect(
      kitsAfter.data.some(
        (kit) => kit.departmentId === 'dept-tech' && !kit.position,
      ),
    ).toBe(false);
    expect(
      kitsAfter.data.some(
        (kit) => kit.departmentId === 'dept-rd' && !kit.position,
      ),
    ).toBe(true);
    // Seeded models survive: the demo only borrowed them.
    expect(
      ((await (await get('master/models')).json()) as { total: number }).total,
    ).toBe(20);
    // Its numbers went with it: importing again numbers from the start, so
    // the demo reads the same every time.
    const numbering = app.container.resolve(numberingServiceToken);
    expect(await numbering.next('purchaseOrder')).toBe('PO-000001');
    expect(await numbering.next('device')).toBe('DE-000001');
  });

  // The account importing the demo — the system administrator, who holds no
  // ITAM grant — is an asset manager while the demo is there, and is not
  // once it is cleared; the demo takes back only what it gave.
  it('makes the importer an asset manager while the demo is there', async () => {
    const grants: string[] = [];
    const revoked: string[] = [];
    let created = 0;
    let held = false;
    const written: { actor: string; mentions: readonly string[] }[] = [];
    const resolve = app.container.resolve.bind(app.container);
    const demo = createDemoService({
      database: resolve(databaseManagerToken),
      masterData: resolve(masterDataServiceToken),
      devices: resolve(deviceServiceToken),
      stock: resolve(stockServiceToken),
      entitlements: resolve(entitlementServiceToken),
      procurement: resolve(procurementServiceToken),
      repairs: resolve(repairServiceToken),
      audits: resolve(auditServiceToken),
      disposals: resolve(disposalServiceToken),
      numbering: resolve(numberingServiceToken),
      deviceSync: resolve(deviceSyncServiceToken),
      // The comment service needs the users table, which this harness has
      // not; a recorder stands in for it.
      comments: {
        add: async (actor: string, input: CommentInput) => {
          written.push({ actor, mentions: input.mentions ?? [] });
          return { id: `comment-${String(written.length)}` } as never;
        },
        edit: async () => ({}) as never,
        remove: async () => undefined,
        subjectOf: async () => ({ subjectType: '', subjectId: '' }),
      },
      accounts: {
        create: async () => `staff-${String((created += 1))}`,
        remove: async () => undefined,
        describe: async () => ({ name: 'Staff', email: 'staff@example.com' }),
        grant: async (userId, permissionSet) => {
          grants.push(`${userId}:${permissionSet}`);
          return held ? null : 'assignment-1';
        },
        revoke: async (id) => {
          revoked.push(id);
        },
      },
    });
    await demo.generate('admin', 'en-US');
    expect(grants).toEqual(['admin:itam-asset-manager']);
    // And answers for a share of the to-dos, so 我负责的 is not empty.
    const owned = async (table: string) =>
      (
        await resolve(databaseManagerToken)
          .query()
          .selectFrom(table)
          .select('id')
          .where('ownerId', '=', 'admin')
          .execute()
      ).length;
    expect(await owned('purchaseOrders')).toBe(4);
    expect(await owned('repairs')).toBe(1);
    expect(await owned('disposals')).toBe(2);
    // 信息不一致's devices answer to several people, not all to 吴静
    // (2026-10-17).
    const checks = await resolve(deviceReviewServiceToken).checks();
    expect(checks.length).toBeGreaterThanOrEqual(4);
    expect(
      new Set(checks.map((check) => check.ownerId)).size,
    ).toBeGreaterThanOrEqual(3);
    // Two of them the importer's own.
    expect(checks.filter((check) => check.ownerId === 'admin')).toHaveLength(2);
    // Under 待办 → 我的, every column has something (2026-10-22): a leaver
    // holding the importer's laptop, a joiner they equip, a loan overdue.
    const everything = async (collection: string, action: string) =>
      ({
        type: 'database',
        collection,
        action,
        scope: true,
        fields: [],
        fieldAccess: { input: '*', output: '*' },
      }) as never;
    const mine = await resolve(workbenchServiceToken).myWork(
      'admin',
      everything,
      { scope: 'mine' },
    );
    expect(mine.map((item) => item.key)).toEqual(
      expect.arrayContaining([
        'leaverRecovery',
        'pendingOnboarding',
        'loansDueToday',
      ]),
    );
    expect(mine.filter((item) => !item.count).map((item) => item.key)).toEqual(
      [],
    );
    // And its records carry comment threads, three of which mention it.
    expect(written.length).toBeGreaterThanOrEqual(8);
    expect(written.filter((entry) => entry.actor === 'admin')).toHaveLength(1);
    expect(
      written.filter((entry) => entry.mentions.includes('admin')),
    ).toHaveLength(3);
    await demo.clear('admin');
    expect(revoked).toEqual(['assignment-1']);

    // An importer who held the set already keeps it.
    held = true;
    await demo.generate('admin', 'en-US');
    await demo.clear('admin');
    expect(revoked).toEqual(['assignment-1']);
    // Two whole imports and two clearings.
  }, 120_000);
});
