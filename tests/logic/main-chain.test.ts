// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { approvalRoutes } from '../../server/routes/itam/approvals.js';
import { deviceRoutes } from '../../server/routes/itam/devices.js';
import { auditRoutes } from '../../server/routes/itam/audits.js';
import { disposalRoutes } from '../../server/routes/itam/disposals.js';
import { masterDataRoutes } from '../../server/routes/itam/master-data.js';
import { purchaseOrderRoutes } from '../../server/routes/itam/purchase-orders.js';
import { repairRoutes } from '../../server/routes/itam/repairs.js';
import { createTestApp, json, type TestApp } from '../support/test-app.js';

const manager = { user: 'mia', role: 'manager' as const };
const approver = { user: 'ann', role: 'manager' as const };
const employee = { user: 'li', role: 'employee' as const };

/**
 * The main chain end to end through the HTTP routes: purchase → approval →
 * receipt → stock-in → assignment → repair → audit → disposal,
 * with the history every step leaves behind.
 */
describe('main chain', () => {
  let app: TestApp;
  const post = (
    path: string,
    body: Record<string, unknown> = {},
    who: { user: string; role: 'employee' | 'support' | 'manager' } = manager,
  ) => app.request(`/api/itam/${path}`, { ...json(body), ...who });
  const get = (path: string) => app.request(`/api/itam/${path}`, manager);
  const data = async <T = Record<string, unknown>>(
    response: Response,
  ): Promise<T> => ((await response.json()) as { data: T }).data;
  const ok = async <T = Record<string, unknown>>(
    response: Response,
  ): Promise<T> => {
    if (response.status >= 400)
      throw new Error(`${response.status}: ${await response.text()}`);
    return data<T>(response);
  };

  beforeEach(async () => {
    app = await createTestApp({ seeds: true });
    for (const routes of [
      masterDataRoutes,
      deviceRoutes,
      purchaseOrderRoutes,
      approvalRoutes,
      repairRoutes,
      auditRoutes,
      disposalRoutes,
    ])
      await app.mount(routes);
  });

  afterEach(async () => {
    await app.destroy();
  });

  it('runs purchase → receipt → assign → repair → audit → dispose', async () => {
    const manufacturer = await ok<{ id: string }>(
      await post('master/manufacturers', { name: 'Test Apple' }),
    );
    const category = await ok<{ id: string }>(
      await post('master/categories', {
        name: 'Laptop',
        appliesTo: 'device',
        requiresSerial: true,
      }),
    );
    const model = await ok<{ id: string }>(
      await post('master/models', {
        name: 'MacBook Pro 14',
        categoryId: category.id,
        manufacturerId: manufacturer.id,
      }),
    );
    const location = await ok<{ id: string }>(
      await post('master/locations', { name: 'HQ', type: 'company' }),
    );
    const department = await ok<{ id: string }>(
      await post('master/departments', { name: 'R&D' }),
    );
    const person = await ok<{ id: string }>(
      await post('master/people', {
        name: 'Li Na',
        departmentId: department.id,
        userId: employee.user,
      }),
    );
    const vendor = await ok<{ id: string }>(
      await post('master/vendors', { name: 'Reseller', types: ['equipment'] }),
    );

    // 1. Purchase: draft → submit → approve (by someone else) → order → receive → stock-in.
    const order = await ok<{ id: string }>(
      await post('purchase-orders', {
        reason: 'newHire',
        vendorId: vendor.id,
        departmentId: department.id,
      }),
    );
    const lines = await app.request(
      `/api/itam/purchase-orders/${order.id}/lines`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          lines: [
            {
              itemType: 'device',
              modelId: model.id,
              quantity: 1,
              unitPrice: 12000,
            },
          ],
        }),
        ...manager,
      },
    );
    const line = (await ok<{ id: string }[]>(lines))[0]!;
    await ok(
      await post(`purchase-orders/${order.id}/submit`, { approverId: 'ann' }),
    );
    await ok(
      await post(
        `purchase-orders/${order.id}/decide`,
        { decision: 'approved' },
        approver,
      ),
    );
    await ok(
      // Placing the order answers both dates.
      await post(`purchase-orders/${order.id}/order`, {
        orderedAt: '2026-09-13',
        expectedAt: '2026-09-20',
      }),
    );
    await ok(
      await post(`purchase-orders/${order.id}/receive`, {
        lineId: line.id,
        quantity: 1,
        serialNos: ['SN-CHAIN-1'],
        locationId: location.id,
      }),
    );
    const generated = await ok<{ generated: { type: string; id: string }[] }>(
      await get(`purchase-orders/${order.id}/receipts`),
    );
    const deviceId = generated.generated.find(
      (entry) => entry.type === 'device',
    )!.id;
    expect(
      (await ok<{ status: string }>(await get(`devices/${deviceId}`))).status,
    ).toBe('inStock');

    // 2. Assign to a person, who signs.
    await ok(
      await post(`devices/${deviceId}/assign`, {
        targetType: 'person',
        targetId: person.id,
      }),
    );
    expect(
      (await ok<{ status: string }>(await get(`devices/${deviceId}`))).status,
    ).toBe('inUse');

    // 3. IT repairs a fault and the device comes back to its holder.
    const repair = await ok<{ id: string }>(
      await post('repairs', {
        deviceId,
        method: 'internal',
        faultDescription: 'Several keys do not respond',
        expectedReturnAt: '2030-01-01',
      }),
    );
    expect(
      (await ok<{ status: string }>(await get(`devices/${deviceId}`))).status,
    ).toBe('inRepair');
    await ok(
      await post(`repairs/${repair.id}/complete`, {
        result: 'repaired',
      }),
    );
    expect(
      (await ok<{ status: string }>(await get(`devices/${deviceId}`))).status,
    ).toBe('inUse');

    // 4. An audit counts it.
    const audit = await ok<{ id: string }>(
      await post('audits', {
        name: 'Chain audit',
        scope: { locationIds: [location.id] },
        plannedStart: '2026-09-01',
        plannedEnd: '2026-09-30',
        executorIds: [manager.user],
      }),
    );
    await ok(await post(`audits/${audit.id}/start`));
    const items = await ok<{ id: string }[]>(
      await get(`audits/${audit.id}/items`),
    );
    await ok(
      await post(`audits/${audit.id}/count`, {
        items: [{ itemId: items[0]!.id, result: 'matched' }],
      }),
    );
    expect(
      (await ok<{ status: string }>(await post(`audits/${audit.id}/finish`)))
        .status,
    ).toBe('completed');

    // 5. Returned, then disposed through approval.
    await ok(await post(`devices/${deviceId}/return`, {}));
    const disposal = await ok<{ id: string }>(
      await post('disposals', {
        recipientName: 'Recycler',
        method: 'scrap',
        reason: 'damaged',
        deviceIds: [deviceId],
      }),
    );
    await ok(
      await post(`disposals/${disposal.id}/submit`, { approverId: 'ann' }),
    );
    await ok(
      await post(
        `disposals/${disposal.id}/decide`,
        { decision: 'approved' },
        approver,
      ),
    );
    await ok(
      await post(`disposals/${disposal.id}/execute`, {
        dataWipe: 'notRequired',
      }),
    );
    expect(
      (await ok<{ status: string }>(await get(`devices/${deviceId}`))).status,
    ).toBe('disposed');

    // The device's history tells the whole story.
    const history = (await (
      await get(`devices/${deviceId}/history?pageSize=50`)
    ).json()) as {
      data: { event: { type: string } | null }[];
    };
    const types = history.data.map((item) => item.event?.type);
    for (const expected of [
      'created',
      'assign',
      'repairCreated',
      'repairCompleted',
      'audited',
      'return',
      'statusChange',
    ])
      expect(types).toContain(expected);
  });
});
