// @vitest-environment node
import { driveManagerToken } from '@nocobase/app-server/drive';
import { databaseManagerToken } from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PO_REASONS } from '../../server/providers/itam/procurement.js';
import { referenceNames } from '../../server/providers/itam/purchase-capture.js';
import { masterDataRoutes } from '../../server/routes/itam/master-data.js';
import { purchaseOrderRoutes } from '../../server/routes/itam/purchase-orders.js';
import { createTestApp, json, type TestApp } from '../support/test-app.js';
import { uuidOf } from '../support/ids.js';

const manager = { user: 'mia', role: 'manager' as const };
const employee = { user: 'eve', role: 'employee' as const };

interface Capture {
  readonly values: Record<string, string>;
  readonly lines: readonly Record<string, unknown>[];
  readonly unmatched: readonly Record<string, unknown>[];
  readonly unplaced: Record<string, string>;
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
  // The new order form's fields as the dialog sends them (2026-10-29).
  const FIELDS = [
    {
      key: 'reason',
      type: 'select',
      options: [...PO_REASONS],
    },
    { key: 'ownerId', type: 'reference', reference: 'users' },
    { key: 'departmentId', type: 'reference', reference: 'departments' },
    { key: 'neededBy', type: 'date' },
    { key: 'vendorId', type: 'reference', reference: 'vendors' },
    { key: 'currency', type: 'currency' },
    { key: 'description', type: 'textarea' },
  ];
  /** A reading as the dialog sends it: the header by field, then the rest. */
  const match = async ({
    lines,
    uncertain,
    ...values
  }: Record<string, unknown>) => {
    const response = await post('purchase-orders/capture/match', {
      fields: FIELDS,
      values,
      ...(lines ? { lines } : {}),
      ...(uncertain ? { uncertain } : {}),
    });
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
      vendorId: 'Northwind Test Supplies',
      departmentId: 'test laboratory',
      uncertain: ['vendorId', 'neededBy', 'departmentId', 'nonsense'],
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
    expect(capture.unplaced).toEqual({});
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
      vendorId: 'Contoso Hardware',
      lines: [
        // Another generation is another model, however close the name.
        { description: 'Testbook Pro 14 (T4)', quantity: 10, unitPrice: 2299 },
        // An id the assistant made up names nothing.
        { description: 'Mystery', modelId: 'model-nope', quantity: 1 },
        // Software it could not place says so, so the dialog offers a
        // product to pick or create rather than a model.
        { description: 'Test Painter', itemType: 'subscription', quantity: 4 },
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
      expect.objectContaining({
        description: 'Mystery',
        quantity: 1,
        itemType: null,
      }),
      expect.objectContaining({
        description: 'Test Painter',
        itemType: 'subscription',
      }),
    ]);
    expect(capture.unplaced).toEqual({ vendorId: 'Contoso Hardware' });
  });

  it('sets the owner the material names, by name or sign-in', async () => {
    // A 负责人 stated in the material was ignored (2026-10-29).
    const database = app.container.resolve(databaseManagerToken);
    const client = await database.connection().client<{
      schema: {
        createTable(
          name: string,
          build: (table: Record<string, (name: string) => unknown>) => void,
        ): Promise<void>;
      };
    }>();
    await client.schema.createTable('user', (table) => {
      table.string!('id');
      table.string!('name');
      table.string!('username');
      table.datetime!('deleted_at');
      table.datetime!('disabled_at');
    });
    await database
      .query()
      .insertInto('user')
      .values([
        { id: 'u-wu', name: '吴静', username: 'wujing' },
        {
          id: 'u-gone',
          name: '陈杰',
          username: 'chenjie',
          disabledAt: new Date(),
        },
      ])
      .execute();
    expect((await match({ ownerId: '吴静', lines: [] })).values).toEqual({
      ownerId: 'u-wu',
    });
    expect((await match({ ownerId: 'WuJing', lines: [] })).values).toEqual({
      ownerId: 'u-wu',
    });
    // Someone who cannot sign in is named back rather than set.
    const gone = await match({ ownerId: '陈杰', lines: [] });
    expect(gone.values).toEqual({});
    expect(gone.unplaced).toEqual({ ownerId: '陈杰' });
  });

  it('lists the names a reference may take, for the reading to pick from', async () => {
    // "marketing team" was left unplaced beside 市场部 (2026-10-30).
    const database = app.container.resolve(databaseManagerToken);
    expect(await referenceNames(database, 'vendors')).toContain(
      'Northwind Test Supplies Ltd.',
    );
    expect(await referenceNames(database, 'departments')).toContain(
      'Test Laboratory',
    );
    expect(await referenceNames(database, 'models')).toBeUndefined();
  });

  it('fills only the fields the form sent, each by its type', async () => {
    // What AI 整理 fills is the form's fields, not a list of its own.
    const capture = await match({
      reason: 'not an option',
      neededBy: '2026-12-01',
      surprise: 'dropped',
      lines: [],
    });
    expect(capture.values).toEqual({ neededBy: '2026-12-01' });
  });

  it('takes the currency the material states, and only a currency code', async () => {
    // A quote in yen was entered as yuan (2026-10-29).
    expect((await match({ currency: 'jpy', lines: [] })).values).toEqual({
      currency: 'JPY',
    });
    expect((await match({ currency: '日元', lines: [] })).values).toEqual({});
  });

  it('places an edition or plan of a product on the product', async () => {
    // A quote names the edition; the register keeps the product (2026-10-28).
    const capture = await match({
      lines: [
        {
          description: 'Test Sketcher 团队版',
          itemType: 'subscription',
          quantity: 10,
          unitPrice: 98,
        },
      ],
    });
    expect(capture.lines).toEqual([
      expect.objectContaining({
        itemType: 'subscription',
        softwareProductId: ids.sketcher,
        quantity: 10,
        unitPrice: 98,
      }),
    ]);
    expect(capture.unmatched).toEqual([]);
  });

  it('places a part code misread off the page on the one code it starts with', async () => {
    const capture = await match({
      lines: [
        // The quantity "4" run into the code by the PDF's text layer.
        { description: 'Testbook memory', partCode: 'TBP14-T34', quantity: 4 },
        // Too far from any code on the books to be a misreading.
        {
          description: 'Something else',
          partCode: 'TBP14-T3XYZW',
          quantity: 1,
        },
      ],
    });
    expect(capture.lines).toEqual([
      // Placed, but for the reader to check.
      expect.objectContaining({ modelId: ids.book, uncertain: true }),
    ]);
    expect(capture.unmatched).toEqual([
      expect.objectContaining({ partCode: 'TBP14-T3XYZW' }),
    ]);
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
          id: uuidOf(file.id),
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
        fileId: uuidOf('file-attached'),
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
      post(
        'purchase-orders/capture/document-text',
        { fileId: uuidOf(fileId) },
        who,
      );
    expect(await data(await read('file-fresh'))).toEqual({
      text: quote.trim(),
      truncated: false,
    });
    expect((await read('file-old')).status).toBe(404);
    expect((await read('file-attached')).status).toBe(404);
    expect((await read('file-fresh', employee)).status).toBe(403);
    // An id that cannot be a file's is not found, on every database: a UUID
    // column on PostgreSQL refused it with a 500 (2026-10-25).
    expect(
      (
        await post('purchase-orders/capture/document-text', {
          fileId: 'not-a-file',
        })
      ).status,
    ).toBe(404);
  });
});
