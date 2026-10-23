import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { addDays, today } from '../../server/providers/itam/dates.js';
import { masterDataRoutes } from '../../server/routes/itam/master-data.js';
import { purchaseOrderRoutes } from '../../server/routes/itam/purchase-orders.js';
import { createTestApp, json, type TestApp } from '../support/test-app.js';

const manager = { user: 'mia', role: 'manager' as const };
const MACBOOK = 'model-macbook-pro-14-m3';

interface Proposal {
  orders: {
    values: Record<string, unknown>;
    lines: {
      itemType: string;
      modelId: string | null;
      softwareProductId: string | null;
      quantity: number;
    }[];
    people: string[];
  }[];
  skipped: { key: string; name: string }[];
}

/**
 * 起草采购单 for what joiners are short of (2026-10-22): the orders proposed
 * for the create dialog — nothing is created — a proposal per vendor and
 * joiner, the vendor where each item was last bought.
 */
describe('proposing orders for joiners', () => {
  let app: TestApp;
  const post = (path: string, body: Record<string, unknown>) =>
    app.request(`/api/itam/${path}`, { ...json(body), ...manager });
  const data = async <T>(response: Response): Promise<T> =>
    ((await response.json()) as { data: T }).data;
  const create = async (path: string, body: Record<string, unknown>) => {
    const response = await post(path, body);
    if (response.status !== 201)
      throw new Error(`${path}: ${await response.text()}`);
    return data<{ id: string }>(response);
  };
  const propose = (body: Record<string, unknown>) =>
    post('purchase-orders/joiner-proposals', body);
  const joiner = (name: string, hireDate: string) =>
    create('master/people', {
      name,
      departmentId: 'dept-rd',
      position: 'Frontend Engineer',
      hireDate,
    });
  const orders = async () =>
    data<unknown[]>(await app.request('/api/itam/purchase-orders', manager));

  beforeEach(async () => {
    app = await createTestApp({ seeds: true });
    for (const routes of [masterDataRoutes, purchaseOrderRoutes])
      await app.mount(routes);
  });

  afterEach(async () => {
    await app.destroy();
  });

  it('proposes an order a joiner, filled as the create dialog takes it, and creates nothing', async () => {
    // Nothing in stock: every item of the R&D kit is short.
    const hireDate = addDays(today(), 20);
    const person = await joiner('Sun Hao', hireDate);
    expect(
      (
        await app.request('/api/itam/purchase-orders/joiner-proposals', {
          ...json({ personId: person.id }),
        })
      ).status,
    ).toBe(401);

    const proposal = await data<Proposal>(
      await propose({ personId: person.id, locale: 'en-US' }),
    );
    // Never bought here: one order, its vendor left for the dialog.
    expect(proposal.orders).toHaveLength(1);
    const [order] = proposal.orders;
    expect(order!.values).toEqual({
      reason: 'newHire',
      description: `New hire kit: Sun Hao, joining ${hireDate}`,
      departmentId: 'dept-rd',
      neededBy: hireDate,
    });
    expect(order!.people).toEqual(['Sun Hao']);
    expect(order!.lines).toContainEqual({
      itemType: 'device',
      modelId: MACBOOK,
      softwareProductId: null,
      quantity: 1,
    });
    expect(await orders()).toEqual([]);
  });

  it('takes the vendor an item was last bought from, and splits by vendor and joiner', async () => {
    const vendor = await create('master/vendors', {
      name: 'Apple reseller',
      types: ['equipment'],
    });
    const old = await create('purchase-orders', {
      reason: 'project',
      description: 'Laptops',
      vendorId: vendor.id,
    });
    expect(
      (
        await app.request(`/api/itam/purchase-orders/${old.id}/lines`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            lines: [{ itemType: 'device', modelId: MACBOOK, quantity: 1 }],
          }),
          ...manager,
        })
      ).status,
    ).toBe(200);
    await joiner('Lin Xue', addDays(today(), 20));
    await joiner('Ma Kai', addDays(today(), 30));
    const proposal = await data<Proposal>(
      await propose({ keys: [`model:${MACBOOK}`] }),
    );
    // A joiner each (their days differ), both from the laptop's vendor.
    expect(proposal.orders).toHaveLength(2);
    for (const order of proposal.orders) {
      expect(order.values.vendorId).toBe(vendor.id);
      expect(order.lines).toEqual([
        {
          itemType: 'device',
          modelId: MACBOOK,
          softwareProductId: null,
          quantity: 1,
        },
      ]);
    }
  });
});
