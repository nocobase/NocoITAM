// @vitest-environment node
import { databaseManagerToken } from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { masterDataRoutes } from '../../server/routes/itam/master-data.js';
import { purchaseOrderRoutes } from '../../server/routes/itam/purchase-orders.js';
import { createTestApp, json, type TestApp } from '../support/test-app.js';

const mia = { user: 'mia', role: 'manager' as const };
const ann = { user: 'ann', role: 'manager' as const };

interface View {
  quotes: { vendorName: string; lines: { lineId: string | null }[] }[];
  chosenIndex: number | null;
  rows: {
    lineId: string;
    lowest: number | null;
    lastPrice: { unitPrice: number; orderNo: string } | null;
    cells: ({ unitPrice: number | null; amount: number | null } | null)[];
  }[];
  totals: {
    amount: number | null;
    covered: number;
    missing: number;
    extras: number;
  }[];
  prices: boolean;
}

/**
 * 报价比较 (2026-10-17): the quotes a draft order is weighed against are
 * kept with it, and what can be counted is counted by the server — each
 * line's price in each quote, the lowest, what a quote leaves out or adds,
 * its total, and the last price paid for the same model.
 */
describe('quote comparison', () => {
  let app: TestApp;
  let orderId: string;
  let laptopLine: string;
  let mouseLine: string;
  let vendorId: string;
  const call = (
    method: string,
    path: string,
    body?: Record<string, unknown>,
    who: typeof mia = mia,
  ) =>
    app.request(`/api/itam/${path}`, {
      ...(body ? json(body) : {}),
      method,
      ...who,
    });
  const data = async <T>(response: Response): Promise<T> =>
    ((await response.json()) as { data: T }).data;
  const created = async (path: string, body: Record<string, unknown>) => {
    const response = await call('POST', path, body);
    if (response.status !== 201)
      throw new Error(`${path}: ${await response.text()}`);
    return (await data<{ id: string }>(response)).id;
  };
  const order = async (lines: Record<string, unknown>[]) => {
    const id = await created('purchase-orders', {
      reason: 'newHire',
      vendorId,
    });
    const set = await call('PUT', `purchase-orders/${id}/lines`, { lines });
    if (set.status !== 200) throw new Error(await set.text());
    return {
      id,
      lines: await data<{ id: string; modelId: string }[]>(set),
    };
  };
  const save = (body: Record<string, unknown>, who = mia) =>
    call('POST', `purchase-orders/${orderId}/quote-comparison`, body, who);
  const quote = (
    vendorName: string,
    lines: { lineId: string | null; unitPrice: number }[],
  ) => ({ vendorName, currency: 'CNY', deliveryDays: 7, lines });

  beforeEach(async () => {
    app = await createTestApp({ seeds: true });
    for (const routes of [masterDataRoutes, purchaseOrderRoutes])
      await app.mount(routes);
    const manufacturerId = await created('master/manufacturers', {
      name: 'Test Lenovo',
    });
    vendorId = await created('master/vendors', {
      name: 'Test Reseller',
      types: ['equipment'],
    });
    const laptops = await created('master/categories', {
      name: 'Test QC Laptop',
      appliesTo: 'device',
    });
    const mice = await created('master/categories', {
      name: 'Test QC Mouse',
      appliesTo: 'accessory',
    });
    const laptop = await created('master/models', {
      name: 'ThinkPad X1',
      categoryId: laptops,
      manufacturerId,
    });
    const mouse = await created('master/models', {
      name: 'MX Master',
      categoryId: mice,
      manufacturerId,
    });
    // An earlier order bought the same laptop, and was approved.
    const earlier = await order([
      { itemType: 'device', modelId: laptop, quantity: 1, unitPrice: 9000 },
    ]);
    await app.container
      .resolve(databaseManagerToken)
      .query()
      .updateTable('purchaseOrders')
      .set({ status: 'approved' })
      .where('id', '=', earlier.id)
      .execute();
    const draft = await order([
      { itemType: 'device', modelId: laptop, quantity: 2 },
      { itemType: 'accessory', modelId: mouse, quantity: 2 },
    ]);
    orderId = draft.id;
    laptopLine = draft.lines.find((line) => line.modelId === laptop)!.id;
    mouseLine = draft.lines.find((line) => line.modelId === mouse)!.id;
  });

  afterEach(async () => {
    await app.destroy();
  });

  it('counts each quote against the order’s lines and the last price paid', async () => {
    const saved = await save({
      quotes: [
        quote('Supplier A', [
          { lineId: laptopLine, unitPrice: 9500 },
          { lineId: mouseLine, unitPrice: 500 },
        ]),
        // B leaves the mouse out and adds a bag the order does not ask for.
        quote('Supplier B', [
          { lineId: laptopLine, unitPrice: 9200 },
          { lineId: null, unitPrice: 199 },
        ]),
      ],
      recommendation: {
        quoteIndex: 0,
        reasons: ['A prices every line'],
      },
      chosenIndex: 0,
    });
    expect(saved.status).toBe(200);

    const view = await data<View>(
      await call('GET', `purchase-orders/${orderId}/quote-comparison`),
    );
    expect(view).toMatchObject({ chosenIndex: 0, prices: true });
    const laptopRow = view.rows.find((row) => row.lineId === laptopLine)!;
    expect(laptopRow).toMatchObject({
      lowest: 1,
      lastPrice: { unitPrice: 9000 },
      cells: [
        { unitPrice: 9500, amount: 19000 },
        { unitPrice: 9200, amount: 18400 },
      ],
    });
    // Only one quote prices the mouse: nothing to call lowest.
    expect(view.rows.find((row) => row.lineId === mouseLine)?.lowest).toBe(
      null,
    );
    expect(view.totals).toEqual([
      { amount: 20000, covered: 2, missing: 0, extras: 0 },
      { amount: 18400, covered: 1, missing: 1, extras: 1 },
    ]);
  });

  it('forgets a line that is not the order’s, and replaces the comparison when redone', async () => {
    await save({
      quotes: [quote('Supplier A', [{ lineId: 'not-a-line', unitPrice: 1 }])],
    });
    let view = await data<View>(
      await call('GET', `purchase-orders/${orderId}/quote-comparison`),
    );
    expect(view.quotes[0]?.lines[0]?.lineId).toBeNull();
    await save({
      quotes: [quote('Supplier C', [{ lineId: laptopLine, unitPrice: 9100 }])],
    });
    view = await data<View>(
      await call('GET', `purchase-orders/${orderId}/quote-comparison`),
    );
    expect(view.quotes.map((entry) => entry.vendorName)).toEqual([
      'Supplier C',
    ]);
  });

  it('is the requester’s, and only before the order is sent for approval', async () => {
    const quotes = [
      quote('Supplier A', [{ lineId: laptopLine, unitPrice: 1 }]),
    ];
    expect((await save({ quotes }, ann)).status).toBe(422);
    expect((await save({ quotes, chosenIndex: 3 })).status).toBe(422);
    expect((await save({ quotes: [] })).status).toBe(400);
    await app.container
      .resolve(databaseManagerToken)
      .query()
      .updateTable('purchaseOrders')
      .set({ status: 'pendingApproval' })
      .where('id', '=', orderId)
      .execute();
    expect((await save({ quotes })).status).toBe(422);
    // An order with none answers nothing.
    expect(
      await data(
        await call('GET', `purchase-orders/${orderId}/quote-comparison`),
      ),
    ).toBeNull();
  });
});
