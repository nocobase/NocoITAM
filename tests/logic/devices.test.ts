// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { computeBookValue } from '../../server/providers/itam/devices.js';
import { deviceRoutes } from '../../server/routes/itam/devices.js';
import { masterDataRoutes } from '../../server/routes/itam/master-data.js';
import { createTestApp, json, type TestApp } from '../support/test-app.js';

interface Fixture {
  readonly modelId: string;
  readonly categoryId: string;
  readonly locationId: string;
  readonly floorId: string;
  readonly personId: string;
  readonly otherPersonId: string;
}

async function seedFixture(app: TestApp): Promise<Fixture> {
  const manager = { user: 'mia', role: 'manager' as const };
  const create = async (collection: string, body: Record<string, unknown>) => {
    const response = await app.request(`/api/itam/master/${collection}`, {
      ...json(body),
      ...manager,
    });
    if (response.status !== 201)
      throw new Error(`${collection}: ${await response.text()}`);
    return ((await response.json()) as { data: { id: string } }).data.id;
  };
  const manufacturerId = await create('manufacturers', { name: 'Test Apple' });
  const categoryId = await create('categories', {
    name: 'Laptop',
    appliesTo: 'device',
    requiresSerial: true,
    depreciationMethod: 'straightLine',
    usefulLifeMonths: 36,
    replacementMonths: 48,
    residualRate: 0.1,
    warrantyMonths: 36,
  });
  const modelId = await create('models', {
    name: 'MacBook Pro 14',
    categoryId,
    manufacturerId,
  });
  const locationId = await create('locations', { name: 'HQ', type: 'company' });
  const floorId = await create('locations', {
    name: 'Floor 3',
    type: 'floor',
    parentId: locationId,
  });
  const departmentId = await create('departments', { name: 'R&D' });
  const personId = await create('people', {
    name: 'Li Na',
    departmentId,
    locationId: floorId,
  });
  const otherPersonId = await create('people', {
    name: 'Zhang Wei',
    departmentId,
  });
  return {
    modelId,
    categoryId,
    locationId,
    floorId,
    personId,
    otherPersonId,
  };
}

describe('devices', () => {
  let app: TestApp;
  let fixture: Fixture;
  const manager = { user: 'mia', role: 'manager' as const };

  const post = (path: string, body: Record<string, unknown> = {}) =>
    app.request(`/api/itam/devices${path}`, { ...json(body), ...manager });
  const createDevice = async (body: Record<string, unknown> = {}) => {
    const response = await post('', {
      modelId: fixture.modelId,
      locationId: fixture.locationId,
      serialNo: `SN-${Math.random().toString(36).slice(2, 8)}`,
      ...body,
    });
    expect(response.status).toBe(201);
    return (
      (await response.json()) as {
        data: Record<string, unknown> & { id: string };
      }
    ).data;
  };

  beforeEach(async () => {
    app = await createTestApp({ seeds: true });
    await app.mount(masterDataRoutes);
    await app.mount(deviceRoutes);
    fixture = await seedFixture(app);
  });

  afterEach(async () => {
    await app.destroy();
  });

  it('requires authentication and the read grant', async () => {
    expect((await app.request('/api/itam/devices')).status).toBe(401);
    expect(
      (
        await app.request('/api/itam/devices', {
          user: 'eve',
          role: 'employee',
        })
      ).status,
    ).toBe(403);
    expect(
      (await app.request('/api/itam/devices', { user: 'sam', role: 'support' }))
        .status,
    ).toBe(200);
  });

  it('finds a device by its model name, not only its own fields', async () => {
    // Devices are named by asset tag (SG-LT-001) while people search for
    // "MacBook", which is the model's name.
    const device = await createDevice({ name: 'SG-LT-001' });
    const list = async (q: string) =>
      (
        (await (
          await app.request(
            `/api/itam/devices?q=${encodeURIComponent(q)}`,
            manager,
          )
        ).json()) as { data: { id: string }[] }
      ).data.map((row) => row.id);
    expect(await list('MacBook')).toEqual([device.id]);
    expect(await list('SG-LT')).toEqual([device.id]);
    expect(await list('ThinkPad')).toEqual([]);
  });

  it('creates a device with generated number and category defaults', async () => {
    const device = await createDevice({
      purchaseDate: '2026-01-15',
      purchasePrice: 15000,
    });
    expect(device.deviceNo).toBe('DE-000001');
    expect(device.name).toBe('MacBook Pro 14');
    expect(device.status).toBe('inStock');
    expect(device.warrantyEndDate).toBe('2029-01-15');
    expect(device.plannedReplacementDate).toBe('2030-01-15');
    expect(device.depreciationMethod).toBe('straightLine');
    expect(device.usefulLifeMonths).toBe(36);
    expect(Number(device.bookValue)).toBeLessThan(15000);

    const second = await createDevice();
    expect(second.deviceNo).toBe('DE-000002');

    // A new purchase date moves the implied dates along; a date the user
    // set by hand stays.
    const patch = async (body: Record<string, unknown>) =>
      (
        (await (
          await app.request(`/api/itam/devices/${device.id}`, {
            ...json(body),
            method: 'PATCH',
            ...manager,
          })
        ).json()) as { data: Record<string, unknown> }
      ).data;
    const moved = await patch({ purchaseDate: '2026-02-01' });
    expect(moved.warrantyEndDate).toBe('2029-02-01');
    expect(moved.plannedReplacementDate).toBe('2030-02-01');
    await patch({ warrantyEndDate: '2030-01-01' });
    const kept = await patch({ purchaseDate: '2026-03-01' });
    expect(kept.warrantyEndDate).toBe('2030-01-01');
    expect(kept.plannedReplacementDate).toBe('2030-03-01');
    // The planned replacement is the category's rule: never set directly,
    // and a changed cycle moves every device of the category.
    const direct = await app.request(`/api/itam/devices/${device.id}`, {
      ...json({ plannedReplacementDate: '2031-01-01' }),
      method: 'PATCH',
      ...manager,
    });
    expect(direct.status).toBe(400);
    const cycle = await app.request(
      `/api/itam/master/categories/${fixture.categoryId}`,
      { ...json({ replacementMonths: 60 }), method: 'PATCH', ...manager },
    );
    expect(cycle.status).toBe(200);
    const recycled = (
      (await (
        await app.request(`/api/itam/devices/${device.id}`, manager)
      ).json()) as { data: Record<string, unknown> }
    ).data;
    expect(recycled.plannedReplacementDate).toBe('2031-03-01');

    // Leased and borrowed devices are not on the books: no depreciation,
    // whatever the category says, and it cannot be switched back on.
    const lessor = (
      (await (
        await app.request('/api/itam/master/vendors', {
          ...json({ name: 'Lessor', types: ['equipment'] }),
          ...manager,
        })
      ).json()) as { data: { id: string } }
    ).data;
    const leased = await createDevice({
      ownership: 'leased',
      lenderVendorId: lessor.id,
      returnDueDate: '2027-01-15',
      purchasePrice: 15000,
    });
    expect(leased.depreciationMethod).toBe('none');
    expect(leased.bookValue).toBeNull();
    const backOn = await app.request(`/api/itam/devices/${leased.id}`, {
      ...json({ depreciationMethod: 'straightLine' }),
      method: 'PATCH',
      ...manager,
    });
    expect(backOn.status).toBe(400);
  });

  it('starts a new device with its model’s extended fields, then lets each change alone', async () => {
    const patch = (path: string, body: Record<string, unknown>) =>
      app.request(`/api/itam/${path}`, {
        ...json(body),
        method: 'PATCH',
        ...manager,
      });
    expect(
      (
        await patch(`master/models/${fixture.modelId}`, {
          attributes: { cpu: 'M3', memory: '16 GB' },
        })
      ).status,
    ).toBe(200);
    // Copied when created; what the caller states wins.
    const device = await createDevice({
      attributes: { memory: '32 GB', hostname: 'LT-01' },
    });
    expect(device.attributes).toEqual({
      cpu: 'M3',
      memory: '32 GB',
      hostname: 'LT-01',
    });
    // From then on the two are separate: changing the model changes no
    // device already made.
    await patch(`master/models/${fixture.modelId}`, {
      attributes: { cpu: 'M4', memory: '16 GB' },
    });
    const read = (await (
      await app.request(`/api/itam/devices/${device.id}`, manager)
    ).json()) as { data: { attributes: Record<string, unknown> } };
    expect(read.data.attributes.cpu).toBe('M3');
    expect((await createDevice()).attributes).toEqual({
      cpu: 'M4',
      memory: '16 GB',
    });
  });

  it('rejects a missing serial for a category that requires one, and duplicates', async () => {
    const missing = await post('', {
      modelId: fixture.modelId,
      locationId: fixture.locationId,
    });
    expect(missing.status).toBe(400);
    await createDevice({ serialNo: 'C02X' });
    const duplicate = await post('', {
      modelId: fixture.modelId,
      locationId: fixture.locationId,
      serialNo: 'C02X',
    });
    expect(duplicate.status).toBe(409);
  });

  it('runs the assign → transfer → return lifecycle with history and allocations', async () => {
    const device = await createDevice();

    const assigned = await post(`/${device.id}/assign`, {
      targetType: 'person',
      targetId: fixture.personId,
    });
    expect(assigned.status).toBe(200);
    const afterAssign = (
      (await assigned.json()) as { data: Record<string, unknown> }
    ).data;
    expect(afterAssign.status).toBe('inUse');
    expect(afterAssign.assigneeId).toBe(fixture.personId);
    expect(afterAssign.departmentId).toBeTruthy();
    // The device now sits where its holder works.
    expect(afterAssign.locationId).toBe(fixture.floorId);

    const again = await post(`/${device.id}/assign`, {
      targetType: 'person',
      targetId: fixture.otherPersonId,
    });
    expect(again.status).toBe(422);

    const transferred = await post(`/${device.id}/transfer`, {
      targetType: 'person',
      targetId: fixture.otherPersonId,
    });
    expect(transferred.status).toBe(200);
    expect(
      ((await transferred.json()) as { data: Record<string, unknown> }).data
        .assigneeId,
    ).toBe(fixture.otherPersonId);

    const returned = await post(`/${device.id}/return`, {
      nextStatus: 'inRepair',
      locationId: fixture.locationId,
      condition: 'screen cracked',
    });
    expect(returned.status).toBe(200);
    const afterReturn = (
      (await returned.json()) as { data: Record<string, unknown> }
    ).data;
    expect(afterReturn.status).toBe('inRepair');
    // Back from its holder the device belongs to no department.
    expect(afterReturn.departmentId).toBeNull();
    expect(afterReturn.assigneeId).toBeNull();
    expect(afterReturn.locationId).toBe(fixture.locationId);

    const events = await app.request(
      `/api/itam/devices/${device.id}/history`,
      manager,
    );
    // One line per business operation, each carrying the fields that
    // operation changed: the timeline and the change log are one stream.
    const timeline = (
      (await events.json()) as {
        data: {
          event: { type: string } | null;
          changes: { field: string | null }[];
        }[];
      }
    ).data;
    expect(timeline.map((item) => item.event?.type).filter(Boolean)).toEqual([
      'return',
      'transfer',
      'assign',
      'created',
    ]);
    const changes = await app.request(
      `/api/itam/devices/${device.id}/history?kind=changes`,
      manager,
    );
    const fields = (
      (await changes.json()) as { data: { changes: { field: string }[] }[] }
    ).data.flatMap((item) => item.changes.map((entry) => entry.field));
    expect(fields.filter((field) => field === 'status').length).toBe(2);

    const allocations = await app.db.database
      .query()
      .selectFrom('allocations')
      .select(['action', 'endedAt'])
      .where('subjectId', '=', device.id)
      .orderBy('createdAt', 'asc')
      .execute<{ action: string; endedAt: unknown }>();
    expect(allocations.map((row) => row.action)).toEqual([
      'assign',
      'transfer',
      'return',
    ]);
    expect(allocations.every((row) => row.endedAt !== null)).toBe(true);
  });

  it('honours reservations and loans', async () => {
    const device = await createDevice();
    const reserved = await post(`/${device.id}/reserve`, {
      reservedForType: 'person',
      reservedForId: fixture.personId,
      reservedUntil: '2099-01-01',
    });
    expect(reserved.status).toBe(200);

    const blocked = await post(`/${device.id}/assign`, {
      targetType: 'person',
      targetId: fixture.otherPersonId,
    });
    expect(blocked.status).toBe(422);
    const allowed = await post(`/${device.id}/assign`, {
      targetType: 'person',
      targetId: fixture.personId,
    });
    expect(allowed.status).toBe(200);
    expect(
      ((await allowed.json()) as { data: Record<string, unknown> }).data
        .reservedForId,
    ).toBeNull();

    const second = await createDevice();
    const loanMissingDate = await post(`/${second.id}/loan`, {
      targetType: 'person',
      targetId: fixture.personId,
    });
    expect(loanMissingDate.status).toBe(400);
    const loaned = await post(`/${second.id}/loan`, {
      targetType: 'person',
      targetId: fixture.personId,
      expectedReturnDate: '2026-12-31',
    });
    expect(
      ((await loaned.json()) as { data: Record<string, unknown> }).data.status,
    ).toBe('onLoan');
  });

  it('blocks lifecycle fields in update and disposed devices', async () => {
    const device = await createDevice();
    const viaUpdate = await app.request(`/api/itam/devices/${device.id}`, {
      ...json({ status: 'inUse' }),
      method: 'PATCH',
      ...manager,
    });
    expect(viaUpdate.status).toBe(400);
    const ok = await app.request(`/api/itam/devices/${device.id}`, {
      ...json({ notes: 'Executive laptop' }),
      method: 'PATCH',
      ...manager,
    });
    expect(ok.status).toBe(200);

    const corrected = await post(`/${device.id}/correct-status`, {
      status: 'disposed',
      reason: 'x',
    });
    expect(corrected.status).toBe(422);
    const lost = await post(`/${device.id}/mark-lost`, {
      notes: 'not found at audit',
    });
    expect(
      ((await lost.json()) as { data: Record<string, unknown> }).data.status,
    ).toBe('lost');
    const restored = await post(`/${device.id}/restore`);
    expect(
      ((await restored.json()) as { data: Record<string, unknown> }).data
        .status,
    ).toBe('inStock');
  });

  it('creates a batch with sequential numbers and per-row serials', async () => {
    const response = await post('/batch', {
      modelId: fixture.modelId,
      locationId: fixture.locationId,
      quantity: 3,
      serialNos: ['B1', 'B2', 'B3'],
      common: { purchaseDate: '2026-09-01', purchasePrice: 12000 },
    });
    expect(response.status).toBe(201);
    const rows = (
      (await response.json()) as {
        data: { deviceNo: string; serialNo: string }[];
      }
    ).data;
    expect(rows.map((row) => row.deviceNo)).toEqual([
      'DE-000001',
      'DE-000002',
      'DE-000003',
    ]);
    expect(rows.map((row) => row.serialNo)).toEqual(['B1', 'B2', 'B3']);

    const rolledBack = await post('/batch', {
      modelId: fixture.modelId,
      locationId: fixture.locationId,
      quantity: 2,
      serialNos: ['B4', 'B1'],
    });
    expect(rolledBack.status).toBe(409);
    const list = await app.request('/api/itam/devices', manager);
    expect(((await list.json()) as { total: number }).total).toBe(3);
  });

  it('reports statistics', async () => {
    await createDevice();
    const device = await createDevice();
    await post(`/${device.id}/assign`, {
      targetType: 'person',
      targetId: fixture.personId,
    });
    const stats = await app.request('/api/itam/devices/stats', manager);
    const data = (
      (await stats.json()) as {
        data: {
          total: number;
          available: number;
          availableIdle: number;
          createdThisMonth: number;
        };
      }
    ).data;
    expect(data.total).toBe(2);
    expect(data.available).toBe(1);
    expect(data.availableIdle).toBe(0);
    expect(data.createdThisMonth).toBe(2);

    const idle = await app.request(
      '/api/itam/devices?filter[view]=idle',
      manager,
    );
    expect(((await idle.json()) as { total: number }).total).toBe(0);
    const created = await app.request(
      '/api/itam/devices?filter[view]=createdThisMonth',
      manager,
    );
    const rows = (await created.json()) as {
      total: number;
      data: { createdAt: string }[];
    };
    expect(rows.total).toBe(2);
    expect(rows.data[0]?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('computes straight-line book value', () => {
    const asOf = new Date(Date.UTC(2027, 0, 15));
    expect(
      computeBookValue(
        {
          depreciationMethod: 'straightLine',
          purchasePrice: 12000,
          purchaseDate: '2026-01-15',
          usefulLifeMonths: 36,
          residualRate: 0.1,
        },
        asOf,
      ),
    ).toEqual({ bookValue: 8400, depreciatedAmount: 3600 });
    expect(
      computeBookValue(
        {
          depreciationMethod: 'straightLine',
          purchasePrice: 12000,
          purchaseDate: '2020-01-15',
          usefulLifeMonths: 36,
          residualRate: 0.1,
        },
        asOf,
      ),
    ).toEqual({ bookValue: 1200, depreciatedAmount: 10800 });
    expect(
      computeBookValue(
        {
          depreciationMethod: 'none',
          purchasePrice: 1,
          purchaseDate: '2026-01-01',
          usefulLifeMonths: 1,
          residualRate: 0,
        },
        asOf,
      ),
    ).toBeUndefined();
  });
});
