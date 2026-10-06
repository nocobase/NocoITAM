// @vitest-environment node
import { driveManagerToken } from '@nocobase/app-server/drive';
import { databaseManagerToken } from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { masterDataRoutes } from '../../server/routes/itam/master-data.js';
import { purchaseOrderRoutes } from '../../server/routes/itam/purchase-orders.js';
import { createTestApp, json, type TestApp } from '../support/test-app.js';

const manager = { user: 'mia', role: 'manager' as const };
const employee = { user: 'eve', role: 'employee' as const };

interface Capture {
  readonly values: Record<string, string>;
  readonly lines: readonly Record<string, unknown>[];
  readonly unmatched: readonly Record<string, unknown>[];
  readonly vendorName: string | null;
  readonly departmentName: string | null;
  readonly uncertain: readonly string[];
}

describe('AI 整理 for a new purchase order', () => {
  let app: TestApp;
  const ids: Record<string, string> = {};
  const post = (
    path: string,
    body: Record<string, unknown> = {},
    who: Record<string, string> = manager,
  ) => app.request(`/api/itam/${path}`, { ...json(body), ...who });
  const data = async <T>(response: Response): Promise<T> =>
    ((await response.json()) as { data: T }).data;
  const created = async (path: string, body: Record<string, unknown>) => {
    const response = await post(path, body);
    if (response.status !== 201)
      throw new Error(`${path}: ${await response.text()}`);
    return (await data<{ id: string }>(response)).id;
  };
  const match = async (body: Record<string, unknown>) => {
    const response = await post('purchase-orders/capture/match', body);
    expect(response.status).toBe(200);
    return data<Capture>(response);
  };
  const query = () => app.container.resolve(databaseManagerToken).query();

  beforeEach(async () => {
    app = await createTestApp({ seeds: true });
    await app.mount(masterDataRoutes);
    await app.mount(purchaseOrderRoutes);
    const maker = await created('master/manufacturers', { name: 'Testmaker' });
    const laptops = await created('master/categories', {
      name: 'Test Laptop',
      appliesTo: 'device',
    });
    const docks = await created('master/categories', {
      name: 'Test Dock',
      appliesTo: 'accessory',
    });
    const design = await created('master/categories', {
      name: 'Test Design',
      appliesTo: 'entitlement',
    });
    ids.book = await created('master/models', {
      name: 'Testbook Pro 14 (T3)',
      categoryId: laptops,
      manufacturerId: maker,
      code: 'TBP14-T3',
    });
    ids.dock = await created('master/models', {
      name: 'Testdock USB-C',
      categoryId: docks,
      manufacturerId: maker,
    });
    ids.sketcher = await created('master/softwareProducts', {
      name: 'Test Sketcher',
      categoryId: design,
      deliveryMethod: 'saas',
    });
    ids.vendor = await created('master/vendors', {
      name: 'Northwind Test Supplies Ltd.',
      types: ['equipment'],
    });
    ids.department = await created('master/departments', {
      name: 'Test Laboratory',
    });
  });

  afterEach(async () => {
    await app.destroy();
  });

  it('matches what the assistant named against the master data', async () => {
    const capture = await match({
      reason: 'newHire',
      description: 'Three new starters in the lab',
      neededBy: '2026-11-01',
      vendorName: 'Northwind Test Supplies',
      departmentName: 'test laboratory',
      uncertain: ['vendor', 'neededBy', 'departmentId', 'nonsense'],
      lines: [
        // The part code decides, whatever the description says.
        {
          description: 'Laptop for starters',
          partCode: 'tbp14 t3',
          quantity: 3,
          unitPrice: 1999,
        },
        // A name with its maker in front still names the model.
        { description: 'Testmaker Testdock USB-C', quantity: 3 },
        {
          description: 'Test Sketcher',
          itemType: 'perpetual',
          quantity: 2,
          uncertain: true,
        },
      ],
    });
    expect(capture.values).toEqual({
      reason: 'newHire',
      description: 'Three new starters in the lab',
      neededBy: '2026-11-01',
      vendorId: ids.vendor,
      departmentId: ids.department,
    });
    expect(capture.lines).toEqual([
      expect.objectContaining({
        itemType: 'device',
        modelId: ids.book,
        quantity: 3,
        unitPrice: 1999,
        uncertain: false,
      }),
      expect.objectContaining({
        itemType: 'accessory',
        modelId: ids.dock,
        unitPrice: null,
      }),
      expect.objectContaining({
        itemType: 'perpetual',
        softwareProductId: ids.sketcher,
        uncertain: true,
      }),
    ]);
    expect(capture.unmatched).toEqual([]);
    expect(capture.vendorName).toBeNull();
    // Only the header fields that were filled, by the form's own keys.
    expect([...capture.uncertain].sort()).toEqual([
      'departmentId',
      'neededBy',
      'vendorId',
    ]);
  });

  it('hands back what it cannot place instead of the nearest record', async () => {
    const capture = await match({
      reason: 'whatever',
      neededBy: 'next week',
      vendorId: 'no-such-vendor',
      vendorName: 'Contoso Hardware',
      lines: [
        // Another generation is another model, however close the name.
        { description: 'Testbook Pro 14 (T4)', quantity: 10, unitPrice: 2299 },
        // An id the assistant made up names nothing.
        { description: 'Mystery', modelId: 'model-nope', quantity: 1 },
      ],
    });
    expect(capture.values).toEqual({});
    expect(capture.lines).toEqual([]);
    expect(capture.unmatched).toEqual([
      expect.objectContaining({
        description: 'Testbook Pro 14 (T4)',
        quantity: 10,
        unitPrice: 2299,
      }),
      expect.objectContaining({ description: 'Mystery', quantity: 1 }),
    ]);
    expect(capture.vendorName).toBe('Contoso Hardware');
  });

  it('takes the assistant’s pick when it names a real record', async () => {
    const capture = await match({
      vendorId: ids.vendor,
      lines: [{ description: 'the T3 laptop', modelId: ids.book, quantity: 2 }],
    });
    expect(capture.values.vendorId).toBe(ids.vendor);
    expect(capture.lines).toEqual([
      expect.objectContaining({ modelId: ids.book, quantity: 2 }),
    ]);
  });

  it('asks for the grant a new order needs, and a well-formed reading', async () => {
    expect(
      (
        await app.request('/api/itam/purchase-orders/capture/match', {
          ...json({ lines: [] }),
        })
      ).status,
    ).toBe(401);
    expect(
      (await post('purchase-orders/capture/match', { lines: [] }, employee))
        .status,
    ).toBe(403);
    expect(
      (await post('purchase-orders/capture/match', { surprise: true })).status,
    ).toBe(400);
  });

  it('reads an upload attached to nothing yet, and no other file', async () => {
    const quote = 'Item,Qty,Price\nTestbook Pro 14 (T3),3,1999\n';
    const stamp = (ago: number) =>
      new Date(Date.now() - ago).toISOString().slice(0, -1);
    const files = [
      { id: 'file-fresh', createdAt: stamp(60_000) },
      { id: 'file-old', createdAt: stamp(2 * 60 * 60_000) },
      { id: 'file-attached', createdAt: stamp(60_000) },
    ];
    for (const file of files)
      await query()
        .insertInto('itamFiles')
        .values({
          id: file.id,
          disk: 'local',
          key: `objects/${file.id}.csv`,
          filename: 'quote.csv',
          ext: 'csv',
          mimeType: 'text/csv',
          size: quote.length,
          createdAt: file.createdAt,
          updatedAt: file.createdAt,
        })
        .execute();
    await query()
      .insertInto('attachmentLinks')
      .values({
        id: 'link-attached',
        fileId: 'file-attached',
        ownerType: 'purchaseOrders',
        ownerId: 'po-somebody-else',
        createdAt: new Date(),
      })
      .execute();
    app.container.instance(driveManagerToken, {
      // eslint-disable-next-line @eslint-react/no-unnecessary-use-prefix -- the drive manager's own method
      use: () => ({ getBytes: async () => new TextEncoder().encode(quote) }),
    } as never);
    const read = (fileId: string, who: Record<string, string> = manager) =>
      post('purchase-orders/capture/document-text', { fileId }, who);
    expect(await data(await read('file-fresh'))).toEqual({
      text: quote.trim(),
      truncated: false,
    });
    expect((await read('file-old')).status).toBe(404);
    expect((await read('file-attached')).status).toBe(404);
    expect((await read('file-fresh', employee)).status).toBe(403);
  });
});
