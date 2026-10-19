// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  maintenanceServiceToken,
  procurementServiceToken,
} from '../../server/providers/index.js';
import { unrestricted } from '../../server/providers/itam/authz-filter.js';
import { approvalRoutes } from '../../server/routes/itam/approvals.js';
import { deviceRoutes } from '../../server/routes/itam/devices.js';
import { entitlementRoutes } from '../../server/routes/itam/entitlements.js';
import { masterDataRoutes } from '../../server/routes/itam/master-data.js';
import { purchaseOrderRoutes } from '../../server/routes/itam/purchase-orders.js';
import { stockRoutes } from '../../server/routes/itam/stock.js';
import { workbenchRoutes } from '../../server/routes/itam/workbench.js';
import { createTestApp, json, type TestApp } from '../support/test-app.js';

const manager = { user: 'mia', role: 'manager' as const };
const approver = { user: 'ann', role: 'manager' as const };

interface Fixture {
  readonly vendorId: string;
  readonly departmentId: string;
  readonly locationId: string;
  readonly modelId: string;
  readonly accessoryModelId: string;
  readonly productId: string;
}

async function seedFixture(app: TestApp): Promise<Fixture> {
  const create = async (path: string, body: Record<string, unknown>) => {
    const response = await app.request(`/api/itam/${path}`, {
      ...json(body),
      ...manager,
    });
    if (response.status !== 201)
      throw new Error(`${path}: ${await response.text()}`);
    return ((await response.json()) as { data: { id: string } }).data.id;
  };
  const manufacturerId = await create('master/manufacturers', {
    name: 'Test Apple',
  });
  const laptop = await create('master/categories', {
    name: 'Laptop',
    appliesTo: 'device',
    requiresSerial: true,
  });
  const mouse = await create('master/categories', {
    name: 'Test Mouse',
    appliesTo: 'accessory',
  });
  const software = await create('master/categories', {
    name: 'Design',
    appliesTo: 'entitlement',
  });
  return {
    vendorId: await create('master/vendors', {
      name: 'Reseller',
      types: ['equipment'],
    }),
    // An order states the department it is for and the vendor it goes to.
    departmentId: await create('master/departments', { name: 'R&D' }),
    locationId: await create('master/locations', {
      name: 'HQ',
      type: 'company',
    }),
    modelId: await create('master/models', {
      name: 'MacBook Pro 14',
      categoryId: laptop,
      manufacturerId,
    }),
    accessoryModelId: await create('master/models', {
      name: 'MX Master',
      categoryId: mouse,
      manufacturerId,
    }),
    productId: await create('master/softwareProducts', {
      name: 'Test Figma',
      categoryId: software,
      deliveryMethod: 'saas',
    }),
  };
}

describe('procurement', () => {
  let app: TestApp;
  let fixture: Fixture;
  const post = (
    path: string,
    body: Record<string, unknown> = {},
    who = manager,
  ) => app.request(`/api/itam/${path}`, { ...json(body), ...who });
  const data = async <T = Record<string, unknown>>(
    response: Response,
  ): Promise<T> => ((await response.json()) as { data: T }).data;

  beforeEach(async () => {
    app = await createTestApp({ seeds: true });
    for (const routes of [
      masterDataRoutes,
      deviceRoutes,
      stockRoutes,
      entitlementRoutes,
      purchaseOrderRoutes,
      approvalRoutes,
      workbenchRoutes,
    ]) {
      await app.mount(routes);
    }
    fixture = await seedFixture(app);
  });

  afterEach(async () => {
    await app.destroy();
  });

  it('runs request → approval → order → receipt → stock-in, generating records', async () => {
    const created = await post('purchase-orders', {
      reason: 'newHire',
      vendorId: fixture.vendorId,
      departmentId: fixture.departmentId,
      description: 'Onboarding',
    });
    expect(created.status).toBe(201);
    const order = await data<{ id: string; orderNo: string; status: string }>(
      created,
    );
    expect(order.orderNo).toBe('PO-000001');
    expect(order.status).toBe('draft');

    const noLines = await post(`purchase-orders/${order.id}/submit`, {
      approverId: 'ann',
    });
    expect(noLines.status).toBe(422);

    const lines = await app.request(
      `/api/itam/purchase-orders/${order.id}/lines`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          lines: [
            {
              itemType: 'device',
              modelId: fixture.modelId,
              quantity: 2,
              unitPrice: 14800,
            },
            {
              itemType: 'accessory',
              modelId: fixture.accessoryModelId,
              quantity: 3,
              unitPrice: 499,
            },
            {
              itemType: 'perpetual',
              softwareProductId: fixture.productId,
              quantity: 5,
              unitPrice: 100,
            },
          ],
        }),
        ...manager,
      },
    );
    expect(lines.status).toBe(200);
    expect((await data<unknown[]>(lines)).length).toBe(3);
    const withTotal = await data<{ estimatedTotal: unknown }>(
      await app.request(`/api/itam/purchase-orders/${order.id}`, manager),
    );
    expect(Number(withTotal.estimatedTotal)).toBe(
      2 * 14800 + 3 * 499 + 5 * 100,
    );

    // An approver must be named.
    expect((await post(`purchase-orders/${order.id}/submit`)).status).toBe(400);
    // The submitter names who should approve, and only they see it queued.
    const submitted = await post(`purchase-orders/${order.id}/submit`, {
      approverId: 'ann',
    });
    expect((await data<{ status: string }>(submitted)).status).toBe(
      'pendingApproval',
    );

    // Only the person it was addressed to decides it.
    const byOther = await post(`purchase-orders/${order.id}/decide`, {
      decision: 'approved',
    });
    expect(byOther.status).toBe(422);

    const queue = await data<{ subjectId: string }[]>(
      await app.request('/api/itam/approvals/pending', approver),
    );
    expect(queue.map((entry) => entry.subjectId)).toContain(order.id);
    // Someone else who may approve is not the one being asked.
    const otherQueue = await data<{ subjectId: string }[]>(
      await app.request('/api/itam/approvals/pending', {
        user: 'mo',
        role: 'manager' as const,
      }),
    );
    expect(otherQueue.map((entry) => entry.subjectId)).not.toContain(order.id);
    // The person asked is told there is something waiting for them.
    expect(
      app.notifications.map((entry) => ({
        to: entry.to.id,
        title: entry.content.title,
      })),
    ).toContainEqual({
      to: 'ann',
      // The notifier resolves a named message; a container without i18n —
      // this one — keeps the key, which is what makes the assertion stable
      // in either language.
      title: expect.stringContaining('notifications.approvalRequested'),
    });
    const approved = await post(
      `purchase-orders/${order.id}/decide`,
      { decision: 'approved', comment: 'ok' },
      approver,
    );
    // ...and the requester hears the answer.
    expect(
      app.notifications.map((entry) => ({
        to: entry.to.id,
        title: entry.content.title,
      })),
    ).toContainEqual({
      to: 'mia',
      title: expect.stringContaining('Approved'),
    });
    expect((await data<{ status: string }>(approved)).status).toBe('approved');

    const ordered = await post(`purchase-orders/${order.id}/order`, {
      orderedAt: '2026-09-13',
      expectedAt: '2026-09-20',
    });
    expect((await data<{ status: string }>(ordered)).status).toBe('ordered');
    // Past the expected date and nothing received: not a 需要关注 rule any
    // more (2026-10-05) — the order is a 待验收到货 to-do already, and its
    // card and summary strip say 到货逾期 N 天.
    const overdue = await app.container
      .resolve(maintenanceServiceToken)
      .reminderCounts();
    expect(overdue.map((entry) => entry.kind)).not.toContain('purchaseOverdue');

    const lineRows = await data<{ id: string; itemType: string }[]>(
      await app.request(`/api/itam/purchase-orders/${order.id}/lines`, manager),
    );
    const deviceLine = lineRows.find((line) => line.itemType === 'device')!;
    const accessoryLine = lineRows.find(
      (line) => line.itemType === 'accessory',
    )!;
    const licenseLine = lineRows.find((line) => line.itemType === 'perpetual')!;

    const overReceipt = await post(`purchase-orders/${order.id}/receive`, {
      lineId: deviceLine.id,
      quantity: 3,
      locationId: fixture.locationId,
      serialNos: ['A', 'B', 'C'],
    });
    expect(overReceipt.status).toBe(422);
    // The receipt answers its own questions and nothing else: `extra` is
    // laid over what the order settled, so a status or price is refused.
    const rewritten = await post(`purchase-orders/${order.id}/receive`, {
      lineId: deviceLine.id,
      quantity: 1,
      locationId: fixture.locationId,
      serialNos: ['X'],
      extra: { status: 'retired', purchasePrice: 1 },
    });
    expect(rewritten.status).toBe(400);
    const receivedDevices = await post(`purchase-orders/${order.id}/receive`, {
      lineId: deviceLine.id,
      quantity: 2,
      locationId: fixture.locationId,
      serialNos: ['C02X1', 'C02X2'],
    });
    expect(receivedDevices.status).toBe(200);
    expect((await data<{ status: string }>(receivedDevices)).status).toBe(
      'partiallyReceived',
    );

    const pending = await app.request(
      `/api/itam/devices?filter[purchaseOrderId]=${order.id}`,
      manager,
    );
    const arrivedDevices = (
      (await pending.json()) as {
        data: {
          id: string;
          status: string;
          serialNo: string;
          purchasePrice: unknown;
        }[];
      }
    ).data;
    expect(arrivedDevices).toHaveLength(2);
    // Vendor, price and date are the order's: not editable on the device.
    const repriced = await app.request(
      `/api/itam/devices/${arrivedDevices[0]!.id}`,
      { ...json({ purchasePrice: 1 }), method: 'PATCH', ...manager },
    );
    expect(repriced.status).toBe(400);
    // Receiving is the check: what arrived is in stock, with no second step.
    expect(arrivedDevices.every((device) => device.status === 'inStock')).toBe(
      true,
    );
    expect(Number(arrivedDevices[0]!.purchasePrice)).toBe(14800);

    const receivedStock = await post(`purchase-orders/${order.id}/receive`, {
      lineId: accessoryLine.id,
      quantity: 3,
      locationId: fixture.locationId,
    });
    expect(receivedStock.status).toBe(200);
    const stock = (
      (await (
        await app.request('/api/itam/stock?filter[kind]=accessory', manager)
      ).json()) as {
        data: { totalQuantity: number; purchaseOrderId: string }[];
      }
    ).data;
    expect(stock).toHaveLength(1);
    expect(stock[0]!.totalQuantity).toBe(3);

    const receivedLicense = await post(`purchase-orders/${order.id}/receive`, {
      lineId: licenseLine.id,
      quantity: 5,
      extra: { maintenanceExpiryDate: '2027-09-01' },
    });
    expect(receivedLicense.status).toBe(200);
    const completed = await data<{ status: string; estimatedTotal: unknown }>(
      receivedLicense,
    );
    expect(completed.status).toBe('completed');
    // One amount, from the lines: what was paid is finance's record, not the
    // register's (the actual total went on 2026-09-26).
    expect(Number(completed.estimatedTotal)).toBe(
      2 * 14800 + 3 * 499 + 5 * 100,
    );
    // Every move went through the order's lifecycle (2026-10-19): created,
    // submitted, decided, placed, received in part and then in full, each
    // at the next version, with the notifications they owed sent.
    const log = await app.db.database
      .query()
      .selectFrom('lifecycleTransitions')
      .select(['transition', 'version'])
      .where('lifecycle', '=', 'purchaseOrders')
      .where('recordId', '=', order.id)
      .orderBy('id', 'asc')
      .execute<{ transition: string; version: number }>();
    expect(log.map((entry) => entry.transition)).toEqual([
      '$create',
      'submit',
      'approve',
      'order',
      'receivePartly',
      'complete',
    ]);
    expect(log.map((entry) => Number(entry.version))).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    const effects = await app.db.database
      .query()
      .selectFrom('lifecycleEffectRuns')
      .select(['effect', 'status'])
      .where('recordId', '=', order.id)
      .execute<{ effect: string; status: string }>();
    expect(effects.map((run) => [run.effect, run.status])).toEqual([
      ['purchaseOrders.notifyApprover', 'succeeded'],
      ['purchaseOrders.notifyDecision', 'succeeded'],
    ]);
    const licenses = (
      (await (await app.request('/api/itam/entitlements', manager)).json()) as {
        data: { id: string; seatCount: number }[];
      }
    ).data;
    expect(licenses[0]!.seatCount).toBe(5);
    // The receipt is the entitlement's purchase record.
    const purchases = await data<{ quantity: number; unitPrice: unknown }[]>(
      await app.request(
        `/api/itam/entitlements/${licenses[0]!.id}/purchases`,
        manager,
      ),
    );
    expect(purchases).toHaveLength(1);
    expect(purchases[0]).toMatchObject({ quantity: 5 });
    expect(Number(purchases[0]!.unitPrice)).toBe(100);

    // A further order adds seats to the same entitlement instead of
    // creating another record.
    const topUp = await data<{ id: string }>(
      await post('purchase-orders', {
        reason: 'other',
        description: 'Two more seats',
        vendorId: fixture.vendorId,
        departmentId: fixture.departmentId,
      }),
    );
    await app.request(`/api/itam/purchase-orders/${topUp.id}/lines`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        lines: [
          {
            itemType: 'perpetual',
            softwareProductId: fixture.productId,
            quantity: 2,
            unitPrice: 120,
          },
        ],
      }),
      ...manager,
    });
    await post(`purchase-orders/${topUp.id}/submit`, { approverId: 'ann' });
    await post(
      `purchase-orders/${topUp.id}/decide`,
      { decision: 'approved' },
      approver,
    );
    await post(`purchase-orders/${topUp.id}/order`, {
      orderedAt: '2026-09-13',
      expectedAt: '2026-09-20',
    });
    const topUpLine = (
      await data<{ id: string }[]>(
        await app.request(
          `/api/itam/purchase-orders/${topUp.id}/lines`,
          manager,
        ),
      )
    )[0]!;
    const wrongProduct = await post(`purchase-orders/${topUp.id}/receive`, {
      lineId: topUpLine.id,
      quantity: 2,
      entitlementId: 'missing',
    });
    expect(wrongProduct.status).toBe(400);
    const added = await post(`purchase-orders/${topUp.id}/receive`, {
      lineId: topUpLine.id,
      quantity: 2,
      entitlementId: licenses[0]!.id,
    });
    expect(added.status).toBe(200);
    const grown = await data<{ seatCount: number }>(
      await app.request(`/api/itam/entitlements/${licenses[0]!.id}`, manager),
    );
    expect(grown.seatCount).toBe(7);
    expect(
      await data<unknown[]>(
        await app.request(
          `/api/itam/entitlements/${licenses[0]!.id}/purchases`,
          manager,
        ),
      ),
    ).toHaveLength(2);

    const generated = await data<{ generated: { type: string }[] }>(
      await app.request(
        `/api/itam/purchase-orders/${order.id}/receipts`,
        manager,
      ),
    );
    expect(generated.generated.map((record) => record.type).sort()).toEqual([
      'device',
      'device',
      'entitlement',
      'stockItem',
    ]);

    const inStock = (
      (await (
        await app.request(
          `/api/itam/devices?filter[purchaseOrderId]=${order.id}`,
          manager,
        )
      ).json()) as { data: { status: string }[] }
    ).data;
    expect(inStock.every((device) => device.status === 'inStock')).toBe(true);

    const blocked = await app.request(`/api/itam/purchase-orders/${order.id}`, {
      method: 'DELETE',
      ...manager,
    });
    expect(blocked.status).toBe(409);

    // The vendor named on an order cannot be deleted while the order exists.
    const vendorImpact = (await (
      await app.request(
        `/api/itam/master/vendors/${fixture.vendorId}/delete-impact`,
        manager,
      )
    ).json()) as {
      data: { level: string; references: { collection: string }[] };
    };
    expect(vendorImpact.data.level).toBe('blocked');
    expect(
      vendorImpact.data.references.map((entry) => entry.collection),
    ).toContain('purchaseOrders');
  });

  it('keeps a line field the caller cannot read out of their write', async () => {
    const order = await data<{ id: string }>(
      await post('purchase-orders', {
        reason: 'stockReplenishment',
        vendorId: fixture.vendorId,
        departmentId: fixture.departmentId,
      }),
    );
    const procurement = app.container.resolve(procurementServiceToken);
    const orderConditions = unrestricted('purchaseOrders', 'update');
    await procurement.setLines(
      order.id,
      [
        {
          itemType: 'device',
          modelId: fixture.modelId,
          quantity: 1,
          unitPrice: 9000,
        },
      ],
      { actorId: 'mia' },
      orderConditions,
    );
    const [line] = await procurement.lines(order.id);
    expect(Number(line?.unitPrice)).toBe(9000);

    // A role without cost access reads every line field but the price.
    const blind = {
      ...unrestricted('purchaseOrderLines', 'read'),
      allFields: false,
      fieldAccess: {
        input: '*' as const,
        output: [
          'id',
          'purchaseOrderId',
          'itemType',
          'modelId',
          'softwareProductId',
          'description',
          'quantity',
          'receivedQuantity',
          'sort',
          'createdAt',
          'updatedAt',
        ],
      },
    };
    // Stating a price they cannot see is refused...
    await expect(
      procurement.setLines(
        order.id,
        [
          {
            id: String(line?.id),
            itemType: 'device',
            modelId: fixture.modelId,
            quantity: 2,
            unitPrice: 1,
          },
        ],
        { actorId: 'mia' },
        orderConditions,
        blind,
      ),
    ).rejects.toThrow(/unitPrice/);
    // ...and the null their client sends in its place leaves the price alone.
    await procurement.setLines(
      order.id,
      [
        {
          id: String(line?.id),
          itemType: 'device',
          modelId: fixture.modelId,
          quantity: 2,
          unitPrice: null,
        },
      ],
      { actorId: 'mia' },
      orderConditions,
      blind,
    );
    const [kept] = await procurement.lines(order.id);
    expect(Number(kept?.quantity)).toBe(2);
    expect(Number(kept?.unitPrice)).toBe(9000);
    const totals = await data<{ estimatedTotal: unknown }>(
      await app.request(`/api/itam/purchase-orders/${order.id}`, manager),
    );
    expect(Number(totals.estimatedTotal)).toBe(18000);
  });

  it('leaves the unit price out of the lines for a reader without cost access', async () => {
    const noCost = { user: 'nia', role: 'noCost' as const };
    const put = (orderId: string, lines: unknown[], who: typeof manager) =>
      app.request(`/api/itam/purchase-orders/${orderId}/lines`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lines }),
        ...who,
      });
    const order = await data<{ id: string }>(
      await post('purchase-orders', {
        reason: 'stockReplenishment',
        vendorId: fixture.vendorId,
        departmentId: fixture.departmentId,
      }),
    );
    await put(
      order.id,
      [
        {
          itemType: 'device',
          modelId: fixture.modelId,
          quantity: 2,
          unitPrice: 9000,
        },
      ],
      manager,
    );

    const [priced] = await data<Record<string, unknown>[]>(
      await app.request(`/api/itam/purchase-orders/${order.id}/lines`, manager),
    );
    expect(Number(priced?.unitPrice)).toBe(9000);

    const blind = await app.request(
      `/api/itam/purchase-orders/${order.id}/lines`,
      noCost,
    );
    expect(blind.status).toBe(200);
    const [line] = await data<Record<string, unknown>[]>(blind);
    expect(line).not.toHaveProperty('unitPrice');
    expect(line?.id).toBe(priced?.id);
    expect(Number(line?.quantity)).toBe(2);
    expect(line?.modelId).toBe(fixture.modelId);

    // What saving the lines answers with is narrowed the same way.
    const own = await data<{ id: string }>(
      await post(
        'purchase-orders',
        {
          reason: 'stockReplenishment',
          vendorId: fixture.vendorId,
          departmentId: fixture.departmentId,
        },
        noCost,
      ),
    );
    const saved = await put(
      own.id,
      [{ itemType: 'device', modelId: fixture.modelId, quantity: 1 }],
      noCost,
    );
    expect(saved.status).toBe(200);
    const [written] = await data<Record<string, unknown>[]>(saved);
    expect(written).not.toHaveProperty('unitPrice');
    expect(written?.id).toEqual(expect.any(String));
  });

  /**
   * Anybody may hand an open order over — the one write the owner rule does
   * not cover. Handing a request over is not editing what it asks for, and an
   * order whose 负责人 had left was stuck: only its owner or its creator could
   * touch it, and both were usually the person who had gone. Every other
   * field stays the owner's, and a closed order keeps the 负责人 it had.
   */
  it('lets anybody hand an open order over, and nothing else', async () => {
    const order = await data<{ id: string }>(
      await post('purchase-orders', {
        reason: 'other',
        vendorId: fixture.vendorId,
        departmentId: fixture.departmentId,
      }),
    );
    await app.request(`/api/itam/purchase-orders/${order.id}/lines`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        lines: [{ itemType: 'device', modelId: fixture.modelId, quantity: 1 }],
      }),
      ...manager,
    });
    await post(`purchase-orders/${order.id}/submit`, { approverId: 'ann' });
    const patch = (body: Record<string, unknown>) =>
      app.request(`/api/itam/purchase-orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        ...approver,
      });

    // Waiting for a decision, and not Ann's: she may still hand it over…
    const handed = await patch({ ownerId: 'ann' });
    expect(handed.status).toBe(200);
    expect((await data<{ ownerId: string }>(handed)).ownerId).toBe('ann');
    // …but a write that touches anything else is an edit, and an edit of a
    // request waiting for a decision is refused whoever makes it.
    expect((await patch({ ownerId: 'mia', description: 'x' })).status).toBe(
      422,
    );

    // A closed order keeps the 负责人 it had: that is history now.
    await post(
      `purchase-orders/${order.id}/decide`,
      { decision: 'approved', comment: 'ok' },
      approver,
    );
    await post(`purchase-orders/${order.id}/cancel`, { reason: 'not needed' });
    expect((await patch({ ownerId: 'mia' })).status).toBe(422);
  });

  it('supports withdraw, reject and cancel', async () => {
    const order = await data<{ id: string }>(
      await post('purchase-orders', {
        reason: 'other',
        vendorId: fixture.vendorId,
        departmentId: fixture.departmentId,
      }),
    );
    await app.request(`/api/itam/purchase-orders/${order.id}/lines`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        lines: [{ itemType: 'device', modelId: fixture.modelId, quantity: 1 }],
      }),
      ...manager,
    });
    // Editing belongs to the side that raised it, the same rule as asking:
    // the approver holds `update` too.
    const rewritten = await app.request(
      `/api/itam/purchase-orders/${order.id}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ description: 'Not yours to change' }),
        ...approver,
      },
    );
    expect(rewritten.status).toBe(422);
    // Asking belongs to the side that asked: the approver holds `submit`
    // too, and may not file someone else's request.
    const filed = await post(
      `purchase-orders/${order.id}/submit`,
      { approverId: 'ann' },
      approver,
    );
    expect(filed.status).toBe(422);
    await post(`purchase-orders/${order.id}/submit`, { approverId: 'ann' });
    // Withdrawing belongs to the side that asked: the approver holds
    // `submit` too, and must decide rather than take it off their desk.
    const stolen = await post(
      `purchase-orders/${order.id}/withdraw`,
      {},
      approver,
    );
    expect(stolen.status).toBe(422);
    const withdrawn = await post(`purchase-orders/${order.id}/withdraw`);
    expect((await data<{ status: string }>(withdrawn)).status).toBe('draft');
    await post(`purchase-orders/${order.id}/submit`, { approverId: 'ann' });
    const rejected = await post(
      `purchase-orders/${order.id}/decide`,
      { decision: 'rejected', comment: 'too expensive' },
      approver,
    );
    expect((await data<{ status: string }>(rejected)).status).toBe('rejected');
    // A rejected order is fixed and asked again, not called off: nothing is
    // waiting on it, so there is nothing to cancel.
    const calledOff = await post(`purchase-orders/${order.id}/cancel`, {
      reason: 'never mind',
    });
    expect(calledOff.status).toBe(422);
    // A line's type is its model's kind: a keyboard is not ordered as a
    // device, which would be approved and then refused on arrival.
    const mismatched = await app.request(
      `/api/itam/purchase-orders/${order.id}/lines`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          lines: [
            {
              itemType: 'device',
              modelId: fixture.accessoryModelId,
              quantity: 1,
            },
          ],
        }),
        ...manager,
      },
    );
    expect(mismatched.status).toBe(400);
    // A rejected order is editable again, and changing its lines needs no
    // reason: nothing has been approved on it.
    const fixed = await app.request(
      `/api/itam/purchase-orders/${order.id}/lines`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          lines: [
            {
              itemType: 'accessory',
              modelId: fixture.accessoryModelId,
              quantity: 1,
            },
          ],
        }),
        ...manager,
      },
    );
    expect(fixed.status).toBe(200);
    const resubmitted = await post(`purchase-orders/${order.id}/submit`, {
      approverId: 'ann',
    });
    expect((await data<{ status: string }>(resubmitted)).status).toBe(
      'pendingApproval',
    );
    const cancelled = await post(`purchase-orders/${order.id}/cancel`, {
      reason: 'not needed',
    });
    expect((await data<{ status: string }>(cancelled)).status).toBe(
      'cancelled',
    );
    const approvals = await data<{ status: string }[]>(
      await app.request(
        `/api/itam/purchase-orders/${order.id}/approvals`,
        manager,
      ),
    );
    expect(approvals.map((entry) => entry.status).sort()).toEqual([
      'rejected',
      'withdrawn',
      'withdrawn',
    ]);
  });

  it('counts and lists what waits on an approver, by kind', async () => {
    const order = await data<{ id: string; orderNo: string }>(
      await post('purchase-orders', {
        reason: 'newHire',
        vendorId: fixture.vendorId,
        departmentId: fixture.departmentId,
        neededBy: '2026-12-01',
      }),
    );
    await app.request(`/api/itam/purchase-orders/${order.id}/lines`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        lines: [{ itemType: 'device', modelId: fixture.modelId, quantity: 1 }],
      }),
      ...manager,
    });
    await post(`purchase-orders/${order.id}/submit`, { approverId: 'ann' });

    const work = async (who: typeof manager, scope = 'mine') =>
      data<
        {
          key: string;
          count: number;
          url: string;
          records: { id: string; title: string; date: string | null }[];
        }[]
      >(await app.request(`/api/itam/workbench/my-work?scope=${scope}`, who));
    const forApprover = await work(approver);
    // One row per kind: a single row counting both would send an approver
    // with disposals waiting to an empty purchase order list.
    expect(
      forApprover.find((item) => item.key === 'pendingPurchaseApprovals'),
    ).toMatchObject({ count: 1, url: '/procurement?view=myApproval' });
    expect(
      forApprover.find((item) => item.key === 'pendingDisposalApprovals'),
    ).toMatchObject({ count: 0, url: '/disposals?view=myApproval' });
    // It waits on the approver it names, not on whoever raised it.
    expect(
      (await work(manager)).find(
        (item) => item.key === 'pendingPurchaseApprovals',
      )?.count,
    ).toBe(0);
    // The team's queue, everybody's default, lists the approval addressed
    // to someone else too, linking to every pending order.
    expect(
      (await work(manager, 'all')).find(
        (item) => item.key === 'pendingPurchaseApprovals',
      ),
    ).toMatchObject({ count: 1, url: '/procurement?status=pendingApproval' });

    // 待验收到货 is the orders this reader raised, by the same rule the
    // service uses for everything the requesting side owns — a purchase
    // order has no 负责人 of its own.
    expect(
      forApprover.find((item) => item.key === 'awaitingReceipt')?.count,
    ).toBe(0);

    // The records come back with the counts: the card lists them straight
    // away rather than waiting to be opened.
    expect(
      forApprover.find((item) => item.key === 'pendingPurchaseApprovals')
        ?.records,
    ).toEqual([
      {
        id: order.id,
        title: order.orderNo,
        date: '2026-12-01',
        url: `/procurement/${order.id}`,
        mine: true,
      },
    ]);
    // In the team's view each approval says whether it waits on the reader
    // (待你审批): the approver's does, the requester's view of it does not.
    const teamRecord = async (who: typeof manager) =>
      (await work(who, 'all')).find(
        (item) => item.key === 'pendingPurchaseApprovals',
      )?.records[0] as { mine?: boolean } | undefined;
    expect((await teamRecord(approver))?.mine).toBe(true);
    expect((await teamRecord(manager))?.mine).toBe(false);
  });

  it('lists an approved order as 待下单 until it is placed', async () => {
    const order = await data<{ id: string; orderNo: string }>(
      await post('purchase-orders', {
        reason: 'newHire',
        vendorId: fixture.vendorId,
        departmentId: fixture.departmentId,
        neededBy: '2026-12-01',
      }),
    );
    await app.request(`/api/itam/purchase-orders/${order.id}/lines`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        lines: [{ itemType: 'device', modelId: fixture.modelId, quantity: 1 }],
      }),
      ...manager,
    });
    await post(`purchase-orders/${order.id}/submit`, { approverId: 'ann' });
    const card = async (who: typeof manager, key: string, scope = 'mine') =>
      (
        await data<{ key: string; count: number; records: unknown[] }[]>(
          await app.request(`/api/itam/workbench/my-work?scope=${scope}`, who),
        )
      ).find((item) => item.key === key);

    // Waiting for its decision, nothing to place yet.
    expect((await card(manager, 'pendingOrders'))?.count).toBe(0);
    await post(
      `purchase-orders/${order.id}/decide`,
      { decision: 'approved' },
      approver,
    );
    // Approved: the order's own side is to place it — not the approver.
    expect(await card(manager, 'pendingOrders')).toMatchObject({
      count: 1,
      records: [
        {
          id: order.id,
          title: order.orderNo,
          date: '2026-12-01',
          url: `/procurement/${order.id}`,
        },
      ],
    });
    expect((await card(approver, 'pendingOrders'))?.count).toBe(0);
    // The team's view lists it for everybody who may place it.
    expect((await card(approver, 'pendingOrders', 'all'))?.count).toBe(1);

    // Placed: it leaves 待下单 for 待到货入库.
    await post(`purchase-orders/${order.id}/order`, {
      orderedAt: '2026-10-05',
      expectedAt: '2026-10-12',
    });
    expect((await card(manager, 'pendingOrders'))?.count).toBe(0);
    expect((await card(manager, 'awaitingReceipt'))?.count).toBe(1);
  });

  it('lets the requester approve their own order', async () => {
    // A deployment with one Asset Manager has nobody else who may approve,
    // so naming yourself is allowed (2026-09-27).
    const order = await data<{ id: string }>(
      await post('purchase-orders', {
        reason: 'other',
        vendorId: fixture.vendorId,
        departmentId: fixture.departmentId,
      }),
    );
    await app.request(`/api/itam/purchase-orders/${order.id}/lines`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        lines: [{ itemType: 'device', modelId: fixture.modelId, quantity: 1 }],
      }),
      ...manager,
    });
    const submitted = await post(`purchase-orders/${order.id}/submit`, {
      approverId: manager.user,
    });
    expect((await data<{ status: string }>(submitted)).status).toBe(
      'pendingApproval',
    );
    // And it reaches their 待我审批: an approval waits on whoever it names,
    // so hiding a self-addressed one left it decidable only from the record
    // page, with the workbench reporting nothing waiting.
    const work = await data<{ key: string; count: number }[]>(
      await app.request('/api/itam/workbench/my-work', manager),
    );
    expect(
      work.find((item) => item.key === 'pendingPurchaseApprovals')?.count,
    ).toBe(1);

    const decided = await post(`purchase-orders/${order.id}/decide`, {
      decision: 'approved',
      comment: 'Only manager here',
    });
    expect((await data<{ status: string }>(decided)).status).toBe('approved');
  });
});
