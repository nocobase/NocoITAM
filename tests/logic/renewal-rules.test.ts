// @vitest-environment node
import { databaseManagerToken } from '@nocobase/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { addDays, today } from '../../server/providers/itam/dates.js';
import { entitlementRoutes } from '../../server/routes/itam/entitlements.js';
import { masterDataRoutes } from '../../server/routes/itam/master-data.js';
import { workbenchRoutes } from '../../server/routes/itam/workbench.js';
import { createTestApp, json, type TestApp } from '../support/test-app.js';

const mia = { user: 'mia', role: 'manager' as const };

/**
 * What a renewal turns on, as rules (2026-10-17, in place of the 授权续费
 * agent): the seats in use against those bought, and the seats people who
 * have left still hold — marked on the seats tab, counted on 需要关注's
 * card, and taken back in one request.
 */
describe('renewal rules', () => {
  let app: TestApp;
  let entitlementId: string;
  let leaverId: string;
  const call = (method: string, path: string, body?: Record<string, unknown>) =>
    app.request(`/api/itam/${path}`, {
      ...(body ? json(body) : {}),
      method,
      ...mia,
    });
  const data = async <T>(response: Response): Promise<T> =>
    ((await response.json()) as { data: T }).data;
  const created = async (path: string, body: Record<string, unknown>) => {
    const response = await call('POST', path, body);
    if (response.status !== 201)
      throw new Error(`${path}: ${await response.text()}`);
    return (await data<{ id: string }>(response)).id;
  };
  type Seat = { id: string; holderId: string; holderLeft: boolean };
  const seats = async () =>
    (
      await data<{ seats: Seat[] }>(
        await call('GET', `entitlements/${entitlementId}/seats`),
      )
    ).seats;

  beforeEach(async () => {
    app = await createTestApp({ seeds: true });
    for (const routes of [masterDataRoutes, entitlementRoutes, workbenchRoutes])
      await app.mount(routes);
    const departmentId = await created('master/departments', { name: 'R&D' });
    leaverId = await created('master/people', { name: 'Li Na', departmentId });
    const stayerId = await created('master/people', {
      name: 'Wang Wu',
      departmentId,
    });
    const categoryId = await created('master/categories', {
      name: 'Test Design',
      appliesTo: 'entitlement',
    });
    const productId = await created('master/softwareProducts', {
      name: 'Test Figma',
      categoryId,
      deliveryMethod: 'saas',
    });
    // Ending in 5 days, not set to renew: 需要关注's 即将停用.
    entitlementId = await created('entitlements', {
      kind: 'subscription',
      softwareProductId: productId,
      name: 'Test Figma Team',
      licensingModel: 'perUser',
      billingModel: 'perSeat',
      billingCycle: 'year',
      unitPrice: 1200,
      seatCount: 5,
      expiryDate: addDays(today(), 5),
      autoRenew: false,
    });
    for (const holderId of [leaverId, stayerId]) {
      const assigned = await call(
        'POST',
        `entitlements/${entitlementId}/assign-seats`,
        { seats: [{ holderId, account: `${holderId}@example.com` }] },
      );
      if (assigned.status !== 200) throw new Error(await assigned.text());
    }
    await app.container
      .resolve(databaseManagerToken)
      .query()
      .updateTable('people')
      .set({ employmentStatus: 'left' })
      .where('id', '=', leaverId)
      .execute();
  });

  afterEach(async () => {
    await app.destroy();
  });

  it('marks the seats people who have left still hold', async () => {
    const list = await seats();
    expect(list).toHaveLength(2);
    expect(list.find((seat) => seat.holderId === leaverId)?.holderLeft).toBe(
      true,
    );
    expect(list.filter((seat) => seat.holderLeft)).toHaveLength(1);
  });

  it('counts seats in use and those leavers hold on the renewal card', async () => {
    const summaries = await data<
      {
        kind: string;
        preview: { label: string; figures?: number[]; leavers?: number }[];
      }[]
    >(await call('GET', 'workbench/reminders'));
    const ending = summaries.find(
      (entry) => entry.kind === 'entitlementEnding',
    );
    expect(ending?.preview[0]).toMatchObject({
      label: 'Test Figma Team',
      figures: [2, 5],
      leavers: 1,
    });
  });

  it('takes the leavers’ seats back in one request', async () => {
    const leavers = (await seats()).filter((seat) => seat.holderLeft);
    const reclaimed = await call(
      'POST',
      `entitlements/${entitlementId}/reclaim-seats`,
      { seatIds: leavers.map((seat) => seat.id) },
    );
    expect(reclaimed.status).toBe(200);
    expect((await seats()).map((seat) => seat.holderLeft)).toEqual([false]);
  });
});
