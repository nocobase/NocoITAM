// @vitest-environment node
import { driveManagerToken } from '@nocobase/app-server/drive';
import { databaseManagerToken } from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { aiRoutes } from '../../server/routes/itam/ai.js';
import { approvalRoutes } from '../../server/routes/itam/approvals.js';
import { deviceRoutes } from '../../server/routes/itam/devices.js';
import { masterDataRoutes } from '../../server/routes/itam/master-data.js';
import { purchaseOrderRoutes } from '../../server/routes/itam/purchase-orders.js';
import { stockRoutes } from '../../server/routes/itam/stock.js';
import { createTestApp, json, type TestApp } from '../support/test-app.js';

const manager = { user: 'mia', role: 'manager' as const };
const approver = { user: 'ann', role: 'manager' as const };
const support = { user: 'sam', role: 'support' as const };
const employee = { user: 'eve', role: 'employee' as const };

interface Order {
  readonly id: string;
  readonly laptopLine: string;
  readonly mouseLine: string;
  readonly seatLine: string;
  readonly locationId: string;
}

describe('receiving in batch and by delivery document', () => {
  let app: TestApp;
  let order: Order;
  const post = (
    path: string,
    body: Record<string, unknown> = {},
    who: Record<string, string> = manager,
  ) => app.request(`/api/itam/${path}`, { ...json(body), ...who });
  const data = async <T = Record<string, unknown>>(
    response: Response,
  ): Promise<T> => ((await response.json()) as { data: T }).data;
  const created = async (path: string, body: Record<string, unknown>) => {
    const response = await post(path, body);
    if (response.status !== 201)
      throw new Error(`${path}: ${await response.text()}`);
    return (await data<{ id: string }>(response)).id;
  };
  const query = () => app.container.resolve(databaseManagerToken).query();

  beforeEach(async () => {
    app = await createTestApp({ seeds: true });
    for (const routes of [
      masterDataRoutes,
      deviceRoutes,
      stockRoutes,
      purchaseOrderRoutes,
      approvalRoutes,
      aiRoutes,
    ])
      await app.mount(routes);
    const manufacturerId = await created('master/manufacturers', {
      name: 'Test Maker',
    });
    const laptop = await created('master/categories', {
      name: 'Test Laptop',
      appliesTo: 'device',
      requiresSerial: true,
    });
    const mouse = await created('master/categories', {
      name: 'Test Pointer',
      appliesTo: 'accessory',
    });
    const vendorId = await created('master/vendors', {
      name: 'Reseller',
      types: ['equipment'],
    });
    const locationId = await created('master/locations', {
      name: 'HQ',
      type: 'company',
    });
    const laptopModel = await created('master/models', {
      name: 'Test Book 14',
      categoryId: laptop,
      manufacturerId,
      code: 'TB14/A',
    });
    const mouseModel = await created('master/models', {
      name: 'Test Mouse',
      categoryId: mouse,
      manufacturerId,
      code: '910-0057',
    });
    const software = await created('master/categories', {
      name: 'Test Design',
      appliesTo: 'entitlement',
    });
    const productId = await created('master/softwareProducts', {
      name: 'Test Sketcher',
      categoryId: software,
      deliveryMethod: 'saas',
    });
    const id = await created('purchase-orders', {
      reason: 'newHire',
      vendorId,
    });
    const lines = await data<{ id: string; itemType: string }[]>(
      await app.request(`/api/itam/purchase-orders/${id}/lines`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          lines: [
            { itemType: 'device', modelId: laptopModel, quantity: 3 },
            { itemType: 'accessory', modelId: mouseModel, quantity: 5 },
            {
              itemType: 'perpetual',
              softwareProductId: productId,
              quantity: 4,
            },
          ],
        }),
        ...manager,
      }),
    );
    await post(`purchase-orders/${id}/submit`, { approverId: 'ann' });
    await post(
      `purchase-orders/${id}/decide`,
      { decision: 'approved' },
      approver,
    );
    await post(`purchase-orders/${id}/order`, {
      orderedAt: '2026-10-01',
      expectedAt: '2026-10-08',
    });
    order = {
      id,
      laptopLine: lines.find((line) => line.itemType === 'device')!.id,
      mouseLine: lines.find((line) => line.itemType === 'accessory')!.id,
      seatLine: lines.find((line) => line.itemType === 'perpetual')!.id,
      locationId,
    };
  });

  afterEach(async () => {
    await app.destroy();
  });

  const laptops = (serialNos: string[]) => ({
    lineId: order.laptopLine,
    quantity: serialNos.length,
    serialNos,
    locationId: order.locationId,
    extra: { ownerId: 'mia' },
  });
  const mice = (quantity: number) => ({
    lineId: order.mouseLine,
    quantity,
    stockItemId: null,
    locationId: order.locationId,
  });

  it('refuses a caller who is anonymous or may not receive', async () => {
    const body = { receipts: [laptops(['S1'])] };
    expect(
      (await post(`purchase-orders/${order.id}/receive-batch`, body, {}))
        .status,
    ).toBe(401);
    expect(
      (await post(`purchase-orders/${order.id}/receive-batch`, body, employee))
        .status,
    ).toBe(403);
    expect(
      (
        await post(
          `purchase-orders/${order.id}/receipt-runs`,
          {
            documentName: 'note.xlsx',
          },
          employee,
        )
      ).status,
    ).toBe(403);
  });

  it('receives several lines in one go, one device per serial', async () => {
    const response = await post(
      `purchase-orders/${order.id}/receive-batch`,
      { receipts: [laptops(['S1', 'S2']), mice(5)] },
      support,
    );
    expect(response.status).toBe(200);
    expect((await data<{ status: string }>(response)).status).toBe(
      'partiallyReceived',
    );
    const devices = await query()
      .selectFrom('devices')
      .select(['serialNo', 'status'])
      .where('purchaseOrderId', '=', order.id)
      .orderBy('serialNo', 'asc')
      .execute<{ serialNo: string; status: string }>();
    expect(devices).toEqual([
      { serialNo: 'S1', status: 'inStock' },
      { serialNo: 'S2', status: 'inStock' },
    ]);
    // A batch typed by hand is the receiver's own.
    const events = await query()
      .selectFrom('historyEvents')
      .select(['origin'])
      .where('subjectId', '=', order.id)
      .where('type', '=', 'received')
      .execute<{ origin: string | null }>();
    expect(events.map((event) => event.origin ?? 'human')).toEqual([
      'human',
      'human',
    ]);
  });

  it('receives seats in the same batch, opening a new entitlement on the terms given', async () => {
    const response = await post(`purchase-orders/${order.id}/receive-batch`, {
      receipts: [
        laptops(['S1']),
        {
          lineId: order.seatLine,
          quantity: 3,
          entitlementId: null,
          extra: { name: 'Sketcher seats', licensingModel: 'perUser' },
        },
      ],
    });
    expect(response.status).toBe(200);
    const entitlement = await query()
      .selectFrom('entitlements')
      .select(['name', 'seatCount', 'kind'])
      .executeTakeFirst<{ name: string; seatCount: number; kind: string }>();
    expect(entitlement).toEqual({
      name: 'Sketcher seats',
      seatCount: 3,
      kind: 'perpetual',
    });
  });

  it('says what would stop a batch, and refuses all of it rather than part', async () => {
    await post(`purchase-orders/${order.id}/receive-batch`, {
      receipts: [laptops(['S1'])],
    });
    const check = await post(`purchase-orders/${order.id}/receipt-check`, {
      lines: [
        { lineId: order.laptopLine, quantity: 2, serialNos: ['S1', ''] },
        { lineId: order.mouseLine, quantity: 6 },
      ],
    });
    expect(check.status).toBe(200);
    expect(
      (await data<{ code: string }[]>(check)).map((entry) => entry.code).sort(),
    ).toEqual(['duplicateInRegister', 'overReceipt', 'serialRequired']);

    const refused = await post(`purchase-orders/${order.id}/receive-batch`, {
      receipts: [mice(5), laptops(['S1'])],
    });
    expect(refused.status).toBe(422);
    // The mice were not received either.
    const stock = await query().selectFrom('stockItems').select('id').execute();
    expect(stock).toHaveLength(0);
  });

  it('records a run from document to receipt, with what the receiver kept', async () => {
    const started = await post(`purchase-orders/${order.id}/receipt-runs`, {
      documentName: 'delivery-note.xlsx',
    });
    expect(started.status).toBe(200);
    const run = await data<{ id: string; status: string; actorId: string }>(
      started,
    );
    expect(run).toMatchObject({ status: 'reading', actorId: 'mia' });

    const draft = {
      deliveryNo: 'DN-7',
      rows: [
        {
          // A wrong guess the part code overrules.
          lineId: order.mouseLine,
          description: 'Test Book 14 16G',
          partCode: 'tb14-a',
          quantity: 2,
          serialNos: ['D1', 'D2'],
          source: 'Sheet1 row 3',
        },
        {
          lineId: order.mouseLine,
          description: 'Mouse',
          quantity: 5,
          source: 'Sheet1 row 4',
        },
        { lineId: null, description: 'Freight', quantity: 1 },
      ],
    };
    // The run is its starter's; nobody else hands it a reading.
    expect(
      (
        await post(
          `purchase-orders/${order.id}/receipt-runs/${run.id}/draft`,
          draft,
          approver,
        )
      ).status,
    ).toBe(422);
    const drafted = await post(
      `purchase-orders/${order.id}/receipt-runs/${run.id}/draft`,
      draft,
    );
    expect(drafted.status).toBe(200);
    const { plan } = await data<{
      plan: {
        lines: { lineId: string; quantity: number; matchedBy: string[] }[];
        issues: { code: string }[];
      };
    }>(drafted);
    expect(
      plan.lines.map((line) => [line.lineId, line.quantity, line.matchedBy]),
    ).toEqual([
      [order.laptopLine, 2, ['partCode']],
      [order.mouseLine, 5, ['assistant']],
    ]);
    expect(plan.issues.map((entry) => entry.code).sort()).toEqual([
      'matchConflict',
      'shortDelivery',
      'unmatched',
    ]);

    // The receiver corrects one serial and receives.
    const received = await post(`purchase-orders/${order.id}/receive-batch`, {
      runId: run.id,
      receipts: [laptops(['D1', 'D2X']), mice(5)],
    });
    expect(received.status).toBe(200);
    const saved = await query()
      .selectFrom('receiptRuns')
      .selectAll()
      .where('id', '=', run.id)
      .executeTakeFirst<{ status: string; stats: unknown }>();
    expect(saved?.status).toBe('saved');
    const stats = (
      typeof saved?.stats === 'string' ? JSON.parse(saved.stats) : saved?.stats
    ) as Record<string, unknown>;
    expect(stats).toEqual({
      quantity: { accepted: 2, changed: 0, removed: 0, added: 0 },
      serialNo: { accepted: 1, changed: 1, removed: 0, added: 0 },
    });
    // What the assistant prepared reads as its, under the receiver's name,
    // and names the document.
    const events = await query()
      .selectFrom('historyEvents')
      .select(['origin', 'actorId', 'payload'])
      .where('subjectId', '=', order.id)
      .where('type', '=', 'received')
      .execute<{ origin: string; actorId: string; payload: unknown }>();
    expect(events.map((event) => [event.origin, event.actorId])).toEqual([
      ['agent', 'mia'],
      ['agent', 'mia'],
    ]);
    expect(JSON.stringify(events[0]?.payload)).toContain('delivery-note.xlsx');
    // A saved run is closed.
    expect(
      (await post(`purchase-orders/${order.id}/receipt-runs/${run.id}/discard`))
        .status,
    ).toBe(200);
    expect(
      (
        await post(`purchase-orders/${order.id}/receipt-runs/${run.id}/fail`, {
          reason: 'late',
        })
      ).status,
    ).toBe(422);

    // The settings page reads the record; a role without the settings
    // grant does not.
    const report = await app.request('/api/itam/ai/receipt-runs', manager);
    expect(report.status).toBe(200);
    const body = await data<{
      summary: { runs: Record<string, number> };
      recent: { orderNo: string; status: string }[];
    }>(report);
    expect(body.summary.runs.saved).toBe(1);
    expect(body.recent[0]).toMatchObject({ status: 'saved' });
    expect(
      (await app.request('/api/itam/ai/receipt-runs', employee)).status,
    ).toBe(403);
  });

  it('keeps the document as text, header block and all', async () => {
    // A delivery note's own header sits above its table. The AI plugin's CSV
    // loader would take its first line for the column names and drop every
    // column past the second; the run reads the text as it is.
    const csv =
      '\uFEFF送货单号,DN-7\n\n品名,料号,数量,序列号\nTest Book 14,TB14/A,2,"S1, S2"\n';
    const now = new Date().toISOString().slice(0, -1);
    await query()
      .insertInto('itamFiles')
      .values({
        id: 'file-note',
        disk: 'local',
        key: 'objects/file-note.csv',
        filename: 'note.csv',
        ext: 'csv',
        mimeType: 'text/csv',
        size: csv.length,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    app.container.instance(driveManagerToken, {
      // eslint-disable-next-line @eslint-react/no-unnecessary-use-prefix -- the drive manager's own method
      use: () => ({
        getBytes: async (key: string) =>
          key === 'objects/file-note.csv'
            ? new TextEncoder().encode(csv)
            : new Uint8Array(),
      }),
    } as never);
    const run = await data<{ documentText: string | null }>(
      await post(`purchase-orders/${order.id}/receipt-runs`, {
        fileId: 'file-note',
        documentName: 'note.csv',
      }),
    );
    expect(run.documentText).toBe(
      '送货单号,DN-7\n\n品名,料号,数量,序列号\nTest Book 14,TB14/A,2,"S1, S2"',
    );
  });

  it('reads a document attached to the order as text for 解析单据, and no other', async () => {
    const quote = '品名,料号,数量,单价\nTest Book 14,TB14/A,2,5299\n';
    const now = new Date().toISOString().slice(0, -1);
    for (const fileId of ['file-quote', 'file-elsewhere'])
      await query()
        .insertInto('itamFiles')
        .values({
          id: fileId,
          disk: 'local',
          key: `objects/${fileId}.csv`,
          filename: 'quote.csv',
          ext: 'csv',
          mimeType: 'text/csv',
          size: quote.length,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    await query()
      .insertInto('attachmentLinks')
      .values({
        id: 'link-quote',
        fileId: 'file-quote',
        ownerType: 'purchaseOrders',
        ownerId: order.id,
        createdAt: new Date(),
      })
      .execute();
    app.container.instance(driveManagerToken, {
      // eslint-disable-next-line @eslint-react/no-unnecessary-use-prefix -- the drive manager's own method
      use: () => ({ getBytes: async () => new TextEncoder().encode(quote) }),
    } as never);
    const read = (fileId: string, who: Record<string, string> = manager) =>
      post(`purchase-orders/${order.id}/document-text`, { fileId }, who);
    expect(
      await data<{ text: string | null }>(await read('file-quote')),
    ).toEqual({ text: quote.trim(), truncated: false });
    // A file that is not this order's is not read through it.
    expect((await read('file-elsewhere')).status).toBe(404);
    expect((await read('file-quote', employee)).status).toBe(403);
  });

  it('closes a run the receiver let go of or the assistant could not read', async () => {
    const start = async () =>
      data<{ id: string }>(
        await post(`purchase-orders/${order.id}/receipt-runs`, {
          documentName: 'scan.jpg',
        }),
      );
    const failed = await start();
    const failure = await post(
      `purchase-orders/${order.id}/receipt-runs/${failed.id}/fail`,
      { reason: 'The model cannot read images' },
    );
    expect(await data<{ status: string }>(failure)).toMatchObject({
      status: 'failed',
    });
    const dropped = await start();
    const discarded = await post(
      `purchase-orders/${order.id}/receipt-runs/${dropped.id}/discard`,
    );
    expect(await data<{ status: string }>(discarded)).toMatchObject({
      status: 'discarded',
    });
    // A run never drafted cannot close a receipt.
    const unread = await start();
    expect(
      (
        await post(`purchase-orders/${order.id}/receive-batch`, {
          runId: unread.id,
          receipts: [mice(1)],
        })
      ).status,
    ).toBe(422);
  });
});
