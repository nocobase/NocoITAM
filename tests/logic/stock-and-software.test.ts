// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  annualCost,
  entitlementServiceToken,
  nextRenewalDate,
} from '../../server/providers/itam/entitlements.js';
import { deviceRoutes } from '../../server/routes/itam/devices.js';
import { entitlementRoutes } from '../../server/routes/itam/entitlements.js';
import { masterDataRoutes } from '../../server/routes/itam/master-data.js';
import { stockRoutes } from '../../server/routes/itam/stock.js';
import { createTestApp, json, type TestApp } from '../support/test-app.js';

const manager = { user: 'mia', role: 'manager' as const };

interface Fixture {
  readonly locationId: string;
  readonly personId: string;
  readonly deviceId: string;
  readonly productId: string;
  readonly accessoryCategoryId: string;
  readonly componentCategoryId: string;
  readonly consumableCategoryId: string;
  readonly accessoryModelId: string;
  readonly componentModelId: string;
  readonly consumableModelId: string;
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
  const deviceCategoryId = await create('master/categories', {
    name: 'Laptop',
    appliesTo: 'device',
  });
  const modelId = await create('master/models', {
    name: 'MBP',
    categoryId: deviceCategoryId,
    manufacturerId,
  });
  const locationId = await create('master/locations', {
    name: 'HQ',
    type: 'company',
  });
  const departmentId = await create('master/departments', { name: 'R&D' });
  const personId = await create('master/people', {
    name: 'Li Na',
    departmentId,
    email: 'lina@example.com',
  });
  const deviceId = await create('devices', { modelId, locationId });
  const softwareCategoryId = await create('master/categories', {
    name: 'Design',
    appliesTo: 'entitlement',
  });
  const productId = await create('master/software-products', {
    name: 'Test Figma',
    categoryId: softwareCategoryId,
    deliveryMethod: 'saas',
  }).catch(async () =>
    create('master/softwareProducts', {
      name: 'Test Figma',
      categoryId: softwareCategoryId,
      deliveryMethod: 'saas',
    }),
  );
  // Stock is always of a model; the model carries its category and maker.
  const accessoryCategoryId = await create('master/categories', {
    name: 'Test Mouse',
    appliesTo: 'accessory',
  });
  const componentCategoryId = await create('master/categories', {
    name: 'Test Memory',
    appliesTo: 'component',
  });
  const consumableCategoryId = await create('master/categories', {
    name: 'Test Toner',
    appliesTo: 'consumable',
  });
  return {
    locationId,
    personId,
    deviceId,
    productId,
    accessoryCategoryId,
    componentCategoryId,
    consumableCategoryId,
    accessoryModelId: await create('master/models', {
      name: 'MX Keys',
      categoryId: accessoryCategoryId,
      manufacturerId,
    }),
    componentModelId: await create('master/models', {
      name: '980 PRO 1 TB',
      categoryId: componentCategoryId,
      manufacturerId,
    }),
    consumableModelId: await create('master/models', {
      name: 'HP 58A',
      categoryId: consumableCategoryId,
      manufacturerId,
    }),
  };
}

describe('stock and software entitlements', () => {
  let app: TestApp;
  let fixture: Fixture;
  const post = (path: string, body: Record<string, unknown> = {}) =>
    app.request(`/api/itam/${path}`, { ...json(body), ...manager });
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
    ]) {
      await app.mount(routes);
    }
    fixture = await seedFixture(app);
  });

  afterEach(async () => {
    await app.destroy();
  });

  it('issues and returns accessories, tracking holdings and availability', async () => {
    const created = await post('stock', {
      kind: 'accessory',
      name: 'MX Keys',
      categoryId: fixture.accessoryCategoryId,
      modelId: fixture.accessoryModelId,
      locationId: fixture.locationId,
      totalQuantity: 5,
      minimumQuantity: 2,
    });
    expect(created.status).toBe(201);
    const item = await data<{
      id: string;
      totalQuantity: number;
      usedQuantity: number;
    }>(created);
    expect(item.totalQuantity).toBe(5);
    // Created with opening stock: one creation line that says so, not a
    // bare "create" beside a separate stock-in.
    const opening = await data<
      {
        event?: { type: string; payload: Record<string, unknown> };
        changes: unknown[];
      }[]
    >(await app.request(`/api/itam/stock/${item.id}/history`, manager));
    expect(opening).toHaveLength(1);
    expect(opening[0]?.event?.type).toBe('created');
    expect(opening[0]?.event?.payload.quantity).toBe(5);
    expect(opening[0]?.changes).toEqual([]);

    const issued = await post(`stock/${item.id}/issue`, {
      holderType: 'person',
      holderId: fixture.personId,
      quantity: 2,
    });
    expect(issued.status).toBe(200);
    expect((await data<{ usedQuantity: number }>(issued)).usedQuantity).toBe(2);

    const tooMany = await post(`stock/${item.id}/issue`, {
      holderType: 'person',
      holderId: fixture.personId,
      quantity: 4,
    });
    expect(tooMany.status).toBe(422);

    const toDevice = await post(`stock/${item.id}/issue`, {
      holderType: 'device',
      holderId: fixture.deviceId,
      quantity: 1,
    });
    expect(toDevice.status).toBe(400);

    const holdings = await data<{ holderId: string; quantity: number }[]>(
      await app.request(`/api/itam/stock/${item.id}/holdings`, manager),
    );
    expect(holdings).toEqual([
      expect.objectContaining({ holderId: fixture.personId, quantity: 2 }),
    ]);

    const returned = await post(`stock/${item.id}/take-back`, {
      holderType: 'person',
      holderId: fixture.personId,
      quantity: 1,
    });
    expect((await data<{ usedQuantity: number }>(returned)).usedQuantity).toBe(
      1,
    );
    // The log nets returns against the oldest issue of that holder, so the
    // current holders are just the issues with something remaining.
    const log = await data<{ type: string; remaining?: number }[]>(
      await app.request(`/api/itam/stock/${item.id}/movements`, manager),
    );
    expect(log.map((row) => [row.type, row.remaining ?? null])).toEqual([
      ['return', null],
      ['issue', 1],
      ['in', null],
    ]);
    const outstanding = await data<{ holderId: string; remaining: number }[]>(
      await app.request(
        `/api/itam/stock/${item.id}/movements?outstanding=1&holderType=person`,
        manager,
      ),
    );
    expect(outstanding).toEqual([
      expect.objectContaining({ holderId: fixture.personId, remaining: 1 }),
    ]);
    expect(
      await data<unknown[]>(
        await app.request(
          `/api/itam/stock/${item.id}/movements?outstanding=1&holderType=location`,
          manager,
        ),
      ),
    ).toEqual([]);
    const stockIn = await post(`stock/${item.id}/stock-in`, { quantity: 3 });
    expect((await data<{ totalQuantity: number }>(stockIn)).totalQuantity).toBe(
      8,
    );

    // A quantity is corrected with a reason: lost or written off down to
    // what is in stock, found on a count up; the timeline says which and why.
    const lost = await post(`stock/${item.id}/adjust`, {
      quantity: -2,
      reason: 'damaged',
      notes: 'Broken in transit',
    });
    expect((await data<{ totalQuantity: number }>(lost)).totalQuantity).toBe(6);
    expect(
      (
        await post(`stock/${item.id}/adjust`, {
          quantity: -100,
          reason: 'lost',
        })
      ).status,
    ).toBe(422);
    // A reason belongs to its direction, and 其他 needs a note.
    expect(
      (await post(`stock/${item.id}/adjust`, { quantity: 1, reason: 'lost' }))
        .status,
    ).toBe(400);
    expect(
      (await post(`stock/${item.id}/adjust`, { quantity: 1, reason: 'other' }))
        .status,
    ).toBe(400);
    expect(
      (
        await post(`stock/${item.id}/adjust`, {
          quantity: 1,
          reason: 'countSurplus',
        })
      ).status,
    ).toBe(200);
    const timeline = await data<
      {
        event: {
          type: string;
          payload: { notes?: string; reason?: string; quantity?: number };
        } | null;
      }[]
    >(await app.request(`/api/itam/stock/${item.id}/history`, manager));
    expect(
      timeline.find(
        (line) =>
          line.event?.type === 'adjust' && line.event.payload.quantity === -2,
      )?.event?.payload,
    ).toMatchObject({ reason: 'damaged', notes: 'Broken in transit' });

    const stats = await data<{
      total: number;
      belowMinimum: number;
      issuedThisMonth: number;
    }>(await app.request('/api/itam/stock/stats?kind=accessory', manager));
    expect(stats.total).toBe(1);
    expect(stats.belowMinimum).toBe(0);
    expect(stats.issuedThisMonth).toBe(2);

    const blocked = await app.request(`/api/itam/stock/${item.id}`, {
      method: 'DELETE',
      ...manager,
    });
    expect(blocked.status).toBe(409);
  });

  it('installs components on devices and consumes consumables', async () => {
    const memory = await data<{ id: string }>(
      await post('stock', {
        kind: 'component',
        name: '16GB DDR5',
        categoryId: fixture.componentCategoryId,
        modelId: fixture.componentModelId,
        locationId: fixture.locationId,
        totalQuantity: 4,
      }),
    );
    const wrongHolder = await post(`stock/${memory.id}/issue`, {
      holderType: 'person',
      holderId: fixture.personId,
      quantity: 1,
    });
    expect(wrongHolder.status).toBe(400);
    const installed = await post(`stock/${memory.id}/issue`, {
      holderType: 'device',
      holderId: fixture.deviceId,
      quantity: 2,
    });
    expect(installed.status).toBe(200);
    const deviceComponents = await data<{ name: string; quantity: number }[]>(
      await app.request(
        `/api/itam/stock/holdings-of/device/${fixture.deviceId}?kind=component`,
        manager,
      ),
    );
    expect(deviceComponents).toEqual([
      expect.objectContaining({ name: '16GB DDR5', quantity: 2 }),
    ]);

    const toner = await data<{ id: string }>(
      await post('stock', {
        kind: 'consumable',
        name: 'Toner 85A',
        categoryId: fixture.consumableCategoryId,
        modelId: fixture.consumableModelId,
        locationId: fixture.locationId,
        totalQuantity: 3,
      }),
    );
    const consumed = await post(`stock/${toner.id}/issue`, {
      holderType: 'person',
      holderId: fixture.personId,
      quantity: 1,
    });
    expect((await data<{ usedQuantity: number }>(consumed)).usedQuantity).toBe(
      1,
    );
    const noReturn = await post(`stock/${toner.id}/take-back`, {
      holderType: 'person',
      holderId: fixture.personId,
      quantity: 1,
    });
    expect(noReturn.status).toBe(422);
    const holdings = await data<unknown[]>(
      await app.request(`/api/itam/stock/${toner.id}/holdings`, manager),
    );
    expect(holdings).toEqual([]);
  });

  /**
   * Offboarding runs every one of these against somebody who has left, so a
   * rule about handing things *out* must not sit in the lookup that the
   * taking-back path shares. It did: 归还 on a leaver's accessories was
   * refused with "cannot issue to a person who has left", reclaiming their
   * seat logged a bare id, and changing that seat's key failed outright.
   */
  it('takes back from a leaver while refusing to issue to one', async () => {
    const item = await data<{ id: string }>(
      await post('stock', {
        kind: 'accessory',
        name: 'MX Keys',
        categoryId: fixture.accessoryCategoryId,
        modelId: fixture.accessoryModelId,
        locationId: fixture.locationId,
        totalQuantity: 5,
      }),
    );
    const license = await data<{ id: string }>(
      await post('entitlements', {
        kind: 'perpetual',
        softwareProductId: fixture.productId,
        name: 'Figma Pro',
        licensingModel: 'perUser',
        seatCount: 2,
      }),
    );
    // Issued and seated while they still worked here.
    expect(
      (
        await post(`stock/${item.id}/issue`, {
          holderType: 'person',
          holderId: fixture.personId,
          quantity: 2,
        })
      ).status,
    ).toBe(200);
    await post(`entitlements/${license.id}/assign-seats`, {
      seats: [{ holderId: fixture.personId }],
    });
    const seats = await data<{ seats: { id: string }[] }>(
      await app.request(`/api/itam/entitlements/${license.id}/seats`, manager),
    );
    const seatId = seats.seats[0]!.id;

    await app.request(`/api/itam/master/people/${fixture.personId}`, {
      ...json({ leaveDate: '2020-01-01' }),
      method: 'PATCH',
      ...manager,
    });

    // Nothing new goes to them.
    expect(
      (
        await post(`stock/${item.id}/issue`, {
          holderType: 'person',
          holderId: fixture.personId,
          quantity: 1,
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await post(`entitlements/${license.id}/assign-seats`, {
          seats: [{ holderId: fixture.personId }],
        })
      ).status,
    ).toBe(422);

    // What they already hold comes back, which is the point of the whole
    // exercise.
    const returned = await post(`stock/${item.id}/take-back`, {
      holderType: 'person',
      holderId: fixture.personId,
      quantity: 2,
    });
    expect(returned.status).toBe(200);
    expect((await data<{ usedQuantity: number }>(returned)).usedQuantity).toBe(
      0,
    );
    // The seat's key still changes, and the log names the holder rather
    // than falling back to their id.
    expect(
      (
        await post(`entitlements/${license.id}/seat-key`, {
          seatId,
          productKey: 'NEW-KEY',
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await post(`entitlements/${license.id}/reclaim-seats`, {
          seatIds: [seatId],
        })
      ).status,
    ).toBe(200);
    const log = await data<{ event?: { summary?: string } }[]>(
      await app.request(
        `/api/itam/entitlements/${license.id}/history`,
        manager,
      ),
    );
    expect(log.some((row) => row.event?.summary?.includes('Li Na'))).toBe(true);
  });

  it('manages perpetual seats and compliance', async () => {
    const created = await post('entitlements', {
      kind: 'perpetual',
      softwareProductId: fixture.productId,
      name: 'Figma Pro',
      licensingModel: 'perUser',
      seatCount: 1,
      expiryDate: '2027-01-01',
      maintenanceExpiryDate: '2027-01-01',
      productKey: 'SECRET-KEY',
    });
    expect(created.status).toBe(201);
    const license = await data<{
      id: string;
      kind: string;
      expiryDate: unknown;
      maintenanceExpiryDate: unknown;
      productKey: unknown;
      hasProductKey: boolean;
      complianceStatus: string;
    }>(created);
    expect(license.kind).toBe('perpetual');
    // Perpetual entitlements never expire; only their maintenance does.
    expect(license.expiryDate).toBeNull();
    expect(license.maintenanceExpiryDate).toBe('2027-01-01');
    expect(license.productKey).toBe('••••••••');
    expect(license.hasProductKey).toBe(true);
    expect(license.complianceStatus).toBe('idle');

    const wrongHolder = await post(`entitlements/${license.id}/assign-seats`, {
      seats: [{ holderType: 'device', holderId: fixture.deviceId }],
    });
    expect(wrongHolder.status).toBe(400);
    // The holder type defaults from the licensing model.
    const assigned = await post(`entitlements/${license.id}/assign-seats`, {
      seats: [{ holderId: fixture.personId }],
    });
    expect(assigned.status).toBe(200);
    expect(
      await data<{ assignedCount: number; complianceStatus: string }>(assigned),
    ).toMatchObject({ assignedCount: 1, complianceStatus: 'compliant' });
    const duplicate = await post(`entitlements/${license.id}/assign-seats`, {
      seats: [{ holderType: 'person', holderId: fixture.personId }],
    });
    expect(duplicate.status).toBe(422);

    const seats = await data<{ seats: { id: string; holderId: string }[] }>(
      await app.request(`/api/itam/entitlements/${license.id}/seats`, manager),
    );
    expect(seats.seats).toHaveLength(1);
    const held = await data<{ entitlementId: string; kind: string }[]>(
      await app.request(
        `/api/itam/entitlements/seats-of/person/${fixture.personId}`,
        manager,
      ),
    );
    expect(held).toMatchObject([
      { entitlementId: license.id, kind: 'perpetual' },
    ]);
    const reclaimed = await post(`entitlements/${license.id}/reclaim-seats`, {
      seatIds: [seats.seats[0]!.id],
    });
    expect(
      (await data<{ assignedCount: number }>(reclaimed)).assignedCount,
    ).toBe(0);

    const revealed = await post(`entitlements/${license.id}/reveal-key`);
    expect((await data<{ productKey: string }>(revealed)).productKey).toBe(
      'SECRET-KEY',
    );
    // Reading a key changes nothing, so it leaves the change log alone; the
    // read is audited in the application log instead.
    const changes = await app.request(
      `/api/itam/entitlements/${license.id}/history?kind=changes`,
      manager,
    );
    expect(
      ((await changes.json()) as { data: { action: string }[] }).data.map(
        (entry) => entry.action,
      ),
    ).not.toContain('view');
    // The kind never changes after creation.
    const rekind = await app.request(`/api/itam/entitlements/${license.id}`, {
      ...json({ kind: 'subscription' }),
      method: 'PATCH',
      ...manager,
    });
    expect(rekind.status).toBe(400);

    // With the seat reclaimed every seat is free again, so the entitlement is idle.
    const stats = await data<{
      total: number;
      perpetual: number;
      idle: number;
      spendThisYear: number | null;
    }>(await app.request('/api/itam/entitlements/stats', manager));
    expect(stats.total).toBe(1);
    expect(stats.perpetual).toBe(1);
    expect(stats.idle).toBe(1);
  });

  it('adjusts the seat count outside a purchase and records why', async () => {
    const license = await data<{ id: string }>(
      await post('entitlements', {
        kind: 'perpetual',
        softwareProductId: fixture.productId,
        name: 'Sketch',
        licensingModel: 'perUser',
        seatCount: 2,
      }),
    );
    // Seats bought without an order are added the way manual stock-in adds
    // quantity: a number and a reason, not an edit of the field.
    const added = await post(`entitlements/${license.id}/adjust-seats`, {
      quantity: 3,
      notes: 'Bought two more from the reseller',
    });
    expect(added.status).toBe(200);
    expect((await data<{ seatCount: number }>(added)).seatCount).toBe(5);

    await post(`entitlements/${license.id}/assign-seats`, {
      seats: [{ holderId: fixture.personId }],
    });
    // Seats in use are the floor; reclaim them first.
    const tooFar = await post(`entitlements/${license.id}/adjust-seats`, {
      quantity: -5,
    });
    expect(tooFar.status).toBe(422);
    const removed = await post(`entitlements/${license.id}/adjust-seats`, {
      quantity: -2,
    });
    expect((await data<{ seatCount: number }>(removed)).seatCount).toBe(3);
    // A change of nothing is not a change.
    expect(
      (await post(`entitlements/${license.id}/adjust-seats`, { quantity: 0 }))
        .status,
    ).toBe(400);

    const events = await data<
      { event?: { type: string; payload: Record<string, unknown> } }[]
    >(
      await app.request(
        `/api/itam/entitlements/${license.id}/history?kind=events`,
        manager,
      ),
    );
    expect(
      events
        .map((entry) => entry.event)
        .filter((event) => event?.type.startsWith('seats'))
        .map((event) => [event?.type, event?.payload.quantity]),
    ).toEqual([
      ['seatsRemoved', 2],
      ['seatsAdded', 3],
    ]);
    expect(
      events.find((entry) => entry.event?.type === 'seatsAdded')?.event?.payload
        .notes,
    ).toBe('Bought two more from the reseller');

    // An entitlement that counts no seats has nothing to adjust.
    const site = await data<{ id: string }>(
      await post('entitlements', {
        kind: 'perpetual',
        softwareProductId: fixture.productId,
        name: 'Sketch site',
        licensingModel: 'site',
      }),
    );
    expect(
      (await post(`entitlements/${site.id}/adjust-seats`, { quantity: 1 }))
        .status,
    ).toBe(422);
  });

  it('lists both kinds together and filters by kind', async () => {
    // Seats are required unless the entitlement is unlimited by nature.
    const noSeats = await post('entitlements', {
      kind: 'perpetual',
      softwareProductId: fixture.productId,
      name: 'Figma Perpetual',
      licensingModel: 'perUser',
    });
    expect(noSeats.status).toBe(400);
    const site = await data<{ id: string; seatCount: unknown }>(
      await post('entitlements', {
        kind: 'perpetual',
        softwareProductId: fixture.productId,
        name: 'Site wide',
        licensingModel: 'site',
        seatCount: 10,
      }),
    );
    expect(site.seatCount).toBeNull();
    await app.request(`/api/itam/entitlements/${site.id}`, {
      method: 'DELETE',
      ...manager,
    });
    await post('entitlements', {
      kind: 'perpetual',
      softwareProductId: fixture.productId,
      name: 'Figma Perpetual',
      licensingModel: 'perUser',
      seatCount: 5,
    });
    const missingBilling = await post('entitlements', {
      kind: 'subscription',
      softwareProductId: fixture.productId,
      name: 'Figma Org',
      expiryDate: '2027-03-01',
    });
    expect(missingBilling.status).toBe(400);
    await post('entitlements', {
      kind: 'subscription',
      softwareProductId: fixture.productId,
      name: 'Figma Org',
      billingModel: 'perSeat',
      seatCount: 3,
      billingCycle: 'month',
      unitPrice: 45,
      expiryDate: '2027-03-01',
    });
    const all = await data<
      { kind: string; name: string; complianceStatus: string }[]
    >(await app.request('/api/itam/entitlements?sort=name', manager));
    expect(all.map((row) => [row.kind, row.name])).toEqual([
      ['subscription', 'Figma Org'],
      ['perpetual', 'Figma Perpetual'],
    ]);
    // Nothing assigned yet, so both read as idle.
    expect(all.map((row) => row.complianceStatus)).toEqual(['idle', 'idle']);
    const onlySubscriptions = await data<{ kind: string }[]>(
      await app.request(
        '/api/itam/entitlements?filter[kind]=subscription',
        manager,
      ),
    );
    expect(onlySubscriptions.map((row) => row.kind)).toEqual(['subscription']);
    const searched = await data<{ name: string }[]>(
      await app.request('/api/itam/entitlements?q=Perpetual', manager),
    );
    expect(searched.map((row) => row.name)).toEqual(['Figma Perpetual']);
    expect((await app.request('/api/itam/entitlements')).status).toBe(401);
  });

  it('manages subscription seats', async () => {
    const created = await post('entitlements', {
      kind: 'subscription',
      softwareProductId: fixture.productId,
      name: 'Figma Org',
      billingModel: 'perSeat',
      seatCount: 3,
      billingCycle: 'month',
      unitPrice: 45,
      expiryDate: '2027-03-01',
    });
    expect(created.status).toBe(201);
    const subscription = await data<{
      id: string;
      annualCost: number;
      autoRenew: boolean;
    }>(created);
    expect(Number(subscription.annualCost)).toBe(1620);
    // A subscription renews unless told otherwise.
    expect(subscription.autoRenew).toBe(true);

    // A seat names a person, an account or both, never neither.
    const nobody = await post(`entitlements/${subscription.id}/assign-seats`, {
      seats: [{ productKey: 'SUB-KEY' }],
    });
    expect(nobody.status).toBe(400);
    const assigned = await post(
      `entitlements/${subscription.id}/assign-seats`,
      {
        seats: [
          { holderId: fixture.personId, account: 'LiNa@Example.com' },
          // A subscription that activates by key keeps the seat's own key.
          { account: 'guest@example.com', productKey: 'SUB-KEY' },
        ],
      },
    );
    expect(assigned.status).toBe(200);
    expect(
      (await data<{ assignedCount: number }>(assigned)).assignedCount,
    ).toBe(2);
    const seats = await data<{
      seats: { id: string; account: string; holderId: string | null }[];
    }>(
      await app.request(
        `/api/itam/entitlements/${subscription.id}/seats`,
        manager,
      ),
    );
    expect(seats.seats.map((seat) => seat.account).sort()).toEqual([
      'guest@example.com',
      'lina@example.com',
    ]);
    const guest = seats.seats.find(
      (seat) => seat.account === 'guest@example.com',
    )!;
    const seatKey = await post(`entitlements/${subscription.id}/reveal-key`, {
      seatId: guest.id,
    });
    expect((await data<{ productKey: string }>(seatKey)).productKey).toBe(
      'SUB-KEY',
    );
    // Without an account the person is the seat, and holds it once.
    const again = await post(`entitlements/${subscription.id}/assign-seats`, {
      seats: [{ holderId: fixture.personId }],
    });
    expect(again.status).toBe(422);

    // Usage is not tracked: there is no import to feed a last-used date.
    const usage = await post(`entitlements/${subscription.id}/import-usage`, {
      rows: [{ account: 'lina@example.com', lastUsedAt: '2026-09-01' }],
    });
    expect(usage.status).toBe(404);

    // Bills are not recorded: the cost is the estimate, the spend is finance's.
    const bill = await post(`entitlements/${subscription.id}/bills`, {
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      amount: 135,
    });
    expect(bill.status).toBe(404);

    const stats = await data<{
      total: number;
      subscription: number;
      annualSpend: number | null;
    }>(await app.request('/api/itam/entitlements/stats', manager));
    expect(stats.total).toBe(1);
    expect(stats.subscription).toBe(1);
    expect(stats.annualSpend).toBe(1620);

    const holdings = await data<{
      entitlementSeats: { account: string }[];
    }>(
      await app.request(
        `/api/itam/master/people/${fixture.personId}/holdings`,
        manager,
      ),
    );
    expect(holdings.entitlementSeats).toHaveLength(1);
    expect(holdings.entitlementSeats[0]?.account).toBe('lina@example.com');
  });

  it('computes annual cost from the one price and the billing cycle', () => {
    // Per seat: every seat bought, held or not.
    expect(
      annualCost({
        billingModel: 'perSeat',
        billingCycle: 'month',
        unitPrice: 10,
        seatCount: 5,
      }),
    ).toBe(600);
    // Flat: the price is the whole cycle, whatever the seat cap.
    expect(
      annualCost({
        billingModel: 'flat',
        billingCycle: 'quarter',
        unitPrice: 250,
        seatCount: 40,
      }),
    ).toBe(1000);
    expect(
      annualCost({
        billingModel: 'flat',
        billingCycle: 'year',
        unitPrice: null,
        seatCount: null,
      }),
    ).toBeNull();
  });

  it('rolls a renewing subscription forward and lets a stopped one end', async () => {
    const renewing = await data<{ id: string }>(
      await post('entitlements', {
        kind: 'subscription',
        softwareProductId: fixture.productId,
        name: 'Monthly',
        billingModel: 'perSeat',
        seatCount: 2,
        billingCycle: 'month',
        unitPrice: 20,
        expiryDate: '2026-01-31',
      }),
    );
    const stopped = await data<{ id: string }>(
      await post('entitlements', {
        kind: 'subscription',
        softwareProductId: fixture.productId,
        name: 'Stopped',
        billingModel: 'perSeat',
        seatCount: 2,
        billingCycle: 'year',
        unitPrice: 200,
        expiryDate: '2026-01-31',
        autoRenew: false,
      }),
    );
    expect(
      (
        await post(`entitlements/${stopped.id}/assign-seats`, {
          seats: [{ holderId: fixture.personId, account: 'a@example.com' }],
        })
      ).status,
    ).toBe(200);

    const service = app.container.resolve(entitlementServiceToken);
    expect(
      await service.advanceRenewals(new Date('2026-04-10T08:00:00Z')),
    ).toBe(1);
    const record = async (id: string) =>
      data<{ expiryDate: string }>(
        await app.request(`/api/itam/entitlements/${id}`, manager),
      );
    // Whole cycles from the day it renews on: Jan 31 → Apr 30.
    expect((await record(renewing.id)).expiryDate.slice(0, 10)).toBe(
      '2026-04-30',
    );
    // Not renewing: the date is its end, and it stays.
    expect((await record(stopped.id)).expiryDate.slice(0, 10)).toBe(
      '2026-01-31',
    );
    const events = await data<
      { event?: { type: string; payload: Record<string, unknown> } }[]
    >(
      await app.request(
        `/api/itam/entitlements/${renewing.id}/history?kind=events`,
        manager,
      ),
    );
    expect(
      events.find((entry) => entry.event?.type === 'renewalAdvanced')?.event
        ?.payload,
    ).toEqual({ from: '2026-01-31', to: '2026-04-30' });

    // The stopped one has ended and still holds a seat to take back.
    const ended = await data<{ id: string }[]>(
      await app.request(
        `/api/itam/entitlements?${new URLSearchParams({
          'filter[view]': 'ended',
        }).toString()}`,
        manager,
      ),
    );
    expect(ended.map((row) => row.id)).toEqual([stopped.id]);
  });

  it('computes the next renewal date by whole cycles', () => {
    expect(nextRenewalDate('2026-01-31', 'month', '2026-02-01')).toBe(
      '2026-02-28',
    );
    expect(nextRenewalDate('2026-01-31', 'quarter', '2026-05-01')).toBe(
      '2026-07-31',
    );
    expect(nextRenewalDate('2025-06-30', 'year', '2026-07-01')).toBe(
      '2027-06-30',
    );
    // Not yet due: unchanged.
    expect(nextRenewalDate('2026-12-31', 'month', '2026-06-01')).toBe(
      '2026-12-31',
    );
  });

  it('lets a flat-priced subscription cap its seats', async () => {
    const created = await post('entitlements', {
      kind: 'subscription',
      name: 'Bundle',
      softwareProductId: fixture.productId,
      billingModel: 'flat',
      billingCycle: 'year',
      unitPrice: 400000,
      seatCount: 1,
      expiryDate: '2027-03-01',
    });
    expect(created.status).toBe(201);
    const bundle = await data<{
      id: string;
      seatCount: number;
      annualCost: number;
    }>(created);
    expect(bundle.seatCount).toBe(1);
    expect(Number(bundle.annualCost)).toBe(400000);
    const seat = (account: string) =>
      post(`entitlements/${bundle.id}/assign-seats`, {
        seats: [{ holderId: fixture.personId, account }],
      });
    expect((await seat('a@example.com')).status).toBe(200);
    // The cap holds like a per-seat count does.
    expect((await seat('b@example.com')).status).toBe(422);

    const uncapped = await data<{ seatCount: number | null }>(
      await post('entitlements', {
        kind: 'subscription',
        name: 'Uncapped',
        softwareProductId: fixture.productId,
        billingModel: 'flat',
        billingCycle: 'year',
        unitPrice: 1200,
        expiryDate: '2027-03-01',
      }),
    );
    expect(uncapped.seatCount).toBeNull();
  });
});
