// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { addDays, today } from '../../server/providers/itam/dates.js';
import { deviceRoutes } from '../../server/routes/itam/devices.js';
import { masterDataRoutes } from '../../server/routes/itam/master-data.js';
import { reportRoutes } from '../../server/routes/itam/reports.js';
import { createTestApp, json, type TestApp } from '../support/test-app.js';

const manager = { user: 'mia', role: 'manager' as const };
const MAC = 'model-macbook-pro-14-m3';

interface Row {
  key: string;
  totals: Record<string, number>;
  supply: number;
  demand: number;
  balance: number | null;
  orderBy: string | null;
  itemType: string | null;
  entries: { kind: string; quantity: number; date: string | null }[];
}

/**
 * 供需分析: per item, what comes in over the window against what goes out —
 * here a MacBook in stock and one a leaver hands back, against joiners.
 */
describe('supply and demand', () => {
  let app: TestApp;
  let locationId = '';

  const data = async <T>(response: Response): Promise<T> =>
    ((await response.json()) as { data: T }).data;
  const create = async (path: string, body: Record<string, unknown>) => {
    const response = await app.request(`/api/itam/${path}`, {
      ...json(body),
      ...manager,
    });
    if (response.status !== 201)
      throw new Error(`${path}: ${await response.text()}`);
    return data<{ id: string }>(response);
  };
  const mac = async (query = '') =>
    (
      await data<{ rows: Row[] }>(
        await app.request(`/api/itam/reports/supply-demand${query}`, manager),
      )
    ).rows.find((row) => row.key === `model:${MAC}`);

  beforeEach(async () => {
    app = await createTestApp({ seeds: true });
    for (const routes of [masterDataRoutes, deviceRoutes, reportRoutes])
      await app.mount(routes);
    locationId = (
      await create('master/locations', { name: 'Test HQ', type: 'company' })
    ).id;
  });

  afterEach(async () => {
    await app.destroy();
  });

  it('weighs stock and leavers’ returns against joiners, and says when to order', async () => {
    await create('devices', {
      modelId: MAC,
      serialNo: 'C02SUPPLY01',
      locationId,
    });
    // Somebody leaving in three days hands theirs back once made ready.
    const leaver = await create('master/people', {
      name: 'Lee Leaving',
      departmentId: 'dept-rd',
      locationId,
      leaveDate: addDays(today(), 3),
    });
    const held = await create('devices', {
      modelId: MAC,
      serialNo: 'C02SUPPLY02',
      locationId,
    });
    await app.db.database
      .query()
      .updateTable('devices')
      .set({ status: 'inUse', assigneeType: 'person', assigneeId: leaver.id })
      .where('id', '=', held.id)
      .execute();

    const hire = (name: string, days: number) =>
      create('master/people', {
        name,
        departmentId: 'dept-rd',
        position: 'Frontend Engineer',
        locationId,
        hireDate: addDays(today(), days),
      });
    await hire('Sun Hao', 20);
    expect(await mac()).toMatchObject({
      totals: expect.objectContaining({ stock: 1, return: 1, joiner: -1 }),
      balance: 1,
      orderBy: null,
      itemType: 'device',
    });

    // Two more joiners: one short, to order by the first need less the
    // days to make it ready (3) and the purchase lead time (7).
    await hire('Lin Xue', 15);
    await hire('Wu Yi', 30);
    expect(await mac()).toMatchObject({
      supply: 2,
      demand: 3,
      balance: -1,
      orderBy: addDays(today(), 15 - 10),
    });

    // A joiner past the window is not counted.
    expect(await mac('?days=25')).toMatchObject({ demand: 2, balance: 0 });
  });

  it('answers only a signed-in reader who may read what it shows', async () => {
    expect((await app.request('/api/itam/reports/supply-demand')).status).toBe(
      401,
    );
    expect(
      (
        await app.request('/api/itam/reports/supply-demand', {
          user: 'eve',
          role: 'employee',
        })
      ).status,
    ).toBe(403);
    expect(
      (await app.request('/api/itam/reports/supply-demand?days=0', manager))
        .status,
    ).toBe(400);
  });
});
