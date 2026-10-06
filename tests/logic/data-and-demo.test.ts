// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  maintenanceServiceToken,
  numberingServiceToken,
} from '../../server/providers/index.js';
import { parseCsv, toCsv } from '../../server/providers/itam/csv.js';
import { today } from '../../server/providers/itam/dates.js';
import { deviceRoutes } from '../../server/routes/itam/devices.js';
import { dataRoutes } from '../../server/routes/itam/data.js';
import { entitlementRoutes } from '../../server/routes/itam/entitlements.js';
import { masterDataRoutes } from '../../server/routes/itam/master-data.js';
import { purchaseOrderRoutes } from '../../server/routes/itam/purchase-orders.js';
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

  beforeEach(async () => {
    app = await createTestApp({ seeds: true });
    for (const routes of [
      masterDataRoutes,
      deviceRoutes,
      entitlementRoutes,
      purchaseOrderRoutes,
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

  it('generates the demo in the language asked for', async () => {
    expect((await post('demo/generate', { language: 'fr-FR' })).status).toBe(
      400,
    );
    const summary = await data<{ language: string | null }>(
      await post('demo/generate', { language: 'zh-CN' }),
    );
    expect(summary.language).toBe('zh-CN');
    const people = await data<
      { name: string; employmentStatus: string; leaveDate: string | null }[]
    >(await get('master/people?pageSize=50'));
    // 陈杰 leaves on the day the demo is imported, so the 离职交接 to-do
    // has a whole handover to show.
    expect(people.find((person) => person.name === '陈杰')).toMatchObject({
      employmentStatus: 'left',
      leaveDate: today(),
    });
  });

  it('generates the demo chain with its problem records and clears it without a trace', async () => {
    const generated = await post('demo/generate');
    expect(generated.status).toBe(200);
    const summary = await data<{
      generated: boolean;
      counts: Record<string, number>;
    }>(generated);
    expect(summary.generated).toBe(true);
    expect(summary.counts.devices).toBeGreaterThanOrEqual(12);
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
    const laptops = await data<{ attributes: Record<string, unknown> }[]>(
      await get('devices?q=SG-LT-00&pageSize=5'),
    );
    expect(laptops.length).toBeGreaterThan(0);
    expect(laptops[0]?.attributes.os).toBe('macOS 15.6');
    // A new device starts with its model's extended fields (2026-10-06):
    // the screen size was filled on the model, the upgraded Latitude
    // states its own processor.
    expect(laptops[0]?.attributes.screenSize).toBe('14');
    const upgraded = await data<{ attributes: Record<string, unknown> }[]>(
      await get('devices?q=SG-LT-007&pageSize=1'),
    );
    expect(upgraded[0]?.attributes.memory).toBe('32 GB');
    expect(upgraded[0]?.attributes.cpu).toBe('Intel Core i7-1355U');
    expect((await post('demo/generate')).status).toBe(422);
    expect((await post('demo/generate', {}, employee)).status).toBe(403);

    const reminders = await app.container
      .resolve(maintenanceServiceToken)
      .reminderCounts();
    const count = (kind: string) =>
      reminders.find((entry) => entry.kind === kind)?.count ?? 0;
    expect(count('warrantyExpiring')).toBeGreaterThanOrEqual(4);
    expect(count('idleDevice')).toBeGreaterThanOrEqual(1);
    expect(count('entitlementOverAllocated')).toBe(1);
    expect(
      count('lowAccessories') +
        count('lowConsumables') +
        count('lowComponents'),
    ).toBe(1);
    // The demo's overdue loan is a to-do card and a notification, not a
    // reminder, since 2026-09-28; its leaver became a to-do the same way,
    // scoped to whoever is responsible for what they still hold.
    expect(count('loanOverdue')).toBe(0);
    expect(count('leftPersonHoldings')).toBe(0);
    expect(count('auditOverdue')).toBeGreaterThanOrEqual(4);
    // The Zoom subscription the demo stopped renewing still holds a seat.
    expect(count('entitlementEnded')).toBe(1);

    // The people list's holding counts agree with each person's stats.
    const people = await data<
      { id: string; name: string; employeeNo: string }[]
    >(await get('master/people?pageSize=50'));
    const holdingCounts = await data<Record<string, Record<string, number>>>(
      await get('master/people/counts'),
    );
    const liNa = people.find(
      (person) => person.name === 'Li Na' && person.employeeNo === 'EMP-101',
    );
    expect(liNa).toBeDefined();
    const stats = await data<{ counts: Record<string, number> }>(
      await get(`master/people/${liNa!.id}/stats`),
    );
    expect(stats.counts.devices).toBe(2);
    expect(stats.counts.accessories).toBe(1);
    expect(stats.counts.entitlements).toBe(2);
    expect(stats.counts.holdings).toBe(5);
    expect(holdingCounts.devices?.[liNa!.id]).toBe(2);
    expect(holdingCounts.accessories?.[liNa!.id]).toBe(1);
    expect(holdingCounts.entitlements?.[liNa!.id]).toBe(2);

    // One placed order carries every kind of line, so receiving it shows
    // every way goods arrive; it is PO-000020 on a fresh import.
    const placed = await data<{ id: string; orderNo: string }[]>(
      await get('purchase-orders?filter[status]=ordered&pageSize=50'),
    );
    const mixed = placed.find((order) => order.orderNo === 'PO-000020');
    expect(mixed).toBeDefined();
    const mixedLines = await data<{ itemType: string }[]>(
      await get(`purchase-orders/${mixed!.id}/lines`),
    );
    expect(mixedLines.map((line) => line.itemType).sort()).toEqual([
      'accessory',
      'component',
      'consumable',
      'device',
      'perpetual',
      'subscription',
    ]);

    const cleared = await data<{ generated: boolean }>(
      await post('demo/clear'),
    );
    expect(cleared.generated).toBe(false);
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
});
