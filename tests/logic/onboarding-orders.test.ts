import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { addDays, today } from '../../server/providers/itam/dates.js';
import { masterDataRoutes } from '../../server/routes/itam/master-data.js';
import { purchaseOrderRoutes } from '../../server/routes/itam/purchase-orders.js';
import { createTestApp, json, type TestApp } from '../support/test-app.js';

const manager = { user: 'mia', role: 'manager' as const };

interface Result {
  created: { id: string; orderNo: string }[];
  needsVendor: { key: string; name: string }[];
  skipped: { key: string; name: string }[];
}

/**
 * 起草采购单 for what joiners are short of (2026-10-22): drafts without a
 * model, the vendor where each item was last bought, and one named by the
 * person where nothing was.
 */
describe('drafting orders for joiners', () => {
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
  const draft = (body: Record<string, unknown>) =>
    post('purchase-orders/draft-for-joiners', body);

  beforeEach(async () => {
    app = await createTestApp({ seeds: true });
    for (const routes of [masterDataRoutes, purchaseOrderRoutes])
      await app.mount(routes);
  });

  afterEach(async () => {
    await app.destroy();
  });

  it('asks for a vendor where nothing was bought, then drafts one order a joiner', async () => {
    // Nothing in stock: every item of the R&D kit is short.
    const hireDate = addDays(today(), 20);
    const person = await create('master/people', {
      name: 'Sun Hao',
      departmentId: 'dept-rd',
      position: 'Frontend Engineer',
      hireDate,
    });
    expect(
      (
        await app.request('/api/itam/purchase-orders/draft-for-joiners', {
          ...json({ personId: person.id }),
        })
      ).status,
    ).toBe(401);

    const first = await data<Result>(await draft({ personId: person.id }));
    expect(first.created).toEqual([]);
    expect(first.needsVendor.length).toBeGreaterThan(0);

    const vendor = await create('master/vendors', {
      name: 'Reseller',
      types: ['equipment'],
    });
    const second = await data<Result>(
      await draft({
        personId: person.id,
        locale: 'en-US',
        vendors: Object.fromEntries(
          first.needsVendor.map((item) => [item.key, vendor.id]),
        ),
      }),
    );
    expect(second.created).toHaveLength(1);
    const order = await data<Record<string, unknown>>(
      await app.request(
        `/api/itam/purchase-orders/${second.created[0]!.id}`,
        manager,
      ),
    );
    expect(order).toMatchObject({
      status: 'draft',
      reason: 'newHire',
      vendorId: vendor.id,
      departmentId: 'dept-rd',
      neededBy: hireDate,
    });
    expect(String(order.description)).toContain('Sun Hao');
    const lines = await data<unknown[]>(
      await app.request(
        `/api/itam/purchase-orders/${second.created[0]!.id}/lines`,
        manager,
      ),
    );
    expect(lines).toHaveLength(first.needsVendor.length);

    // The draft is theirs now: nothing short, nothing drafted again.
    expect(await data<Result>(await draft({ personId: person.id }))).toEqual({
      created: [],
      needsVendor: [],
      skipped: [],
    });
  });

  it('takes the vendor an item was last bought from, without asking', async () => {
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
            lines: [
              {
                itemType: 'device',
                modelId: 'model-macbook-pro-14-m3',
                quantity: 1,
              },
            ],
          }),
          ...manager,
        })
      ).status,
    ).toBe(200);
    const person = await create('master/people', {
      name: 'Lin Xue',
      departmentId: 'dept-rd',
      position: 'Frontend Engineer',
      hireDate: addDays(today(), 20),
    });
    const result = await data<Result>(
      await draft({
        personId: person.id,
        keys: ['model:model-macbook-pro-14-m3'],
      }),
    );
    expect(result.needsVendor).toEqual([]);
    expect(result.created).toHaveLength(1);
    const order = await data<Record<string, unknown>>(
      await app.request(
        `/api/itam/purchase-orders/${result.created[0]!.id}`,
        manager,
      ),
    );
    expect(order.vendorId).toBe(vendor.id);
  });
});
