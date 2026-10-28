// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { addDays, today } from '../../server/providers/itam/dates.js';
import { onboardingServiceToken } from '../../server/providers/itam/onboarding.js';
import { deviceRoutes } from '../../server/routes/itam/devices.js';
import { entitlementRoutes } from '../../server/routes/itam/entitlements.js';
import { masterDataRoutes } from '../../server/routes/itam/master-data.js';
import { workbenchRoutes } from '../../server/routes/itam/workbench.js';
import { createTestApp, json, type TestApp } from '../support/test-app.js';

const manager = { user: 'mia', role: 'manager' as const };

/**
 * 入职配置 and 入职配备: the seeded kits (one per department, a designer's in
 * Product), which kit a person takes, what the plan proposes from stock and
 * the 入职准备 to-do it feeds.
 */
describe('onboarding', () => {
  let app: TestApp;
  let locationId = '';

  const post = (path: string, body: Record<string, unknown> = {}) =>
    app.request(`/api/itam/${path}`, { ...json(body), ...manager });
  const data = async <T>(response: Response): Promise<T> =>
    ((await response.json()) as { data: T }).data;
  const create = async (path: string, body: Record<string, unknown>) => {
    const response = await post(path, body);
    if (response.status !== 201)
      throw new Error(`${path}: ${await response.text()}`);
    return data<{ id: string }>(response);
  };
  const person = (
    name: string,
    departmentId: string,
    position: string | null,
    hireDate = addDays(today(), 5),
  ) =>
    create('master/people', {
      name,
      departmentId,
      position,
      locationId,
      hireDate,
    });
  const plan = async (id: string) =>
    data<{
      kit: { id: string } | null;
      prepared: number;
      required: number;
      lines: {
        target: { id: string };
        preparedCount: number;
        prepared: { id: string; state?: string }[];
        proposals: { type: string; id: string }[];
      }[];
    }>(await app.request(`/api/itam/master/people/${id}/onboarding`, manager));

  beforeEach(async () => {
    app = await createTestApp({ seeds: true });
    for (const routes of [
      masterDataRoutes,
      deviceRoutes,
      entitlementRoutes,
      workbenchRoutes,
    ])
      await app.mount(routes);
    locationId = (
      await create('master/locations', { name: 'Test HQ', type: 'company' })
    ).id;
  });

  afterEach(async () => {
    await app.destroy();
  });

  it('takes the kit of the position, else the department, else its parent', async () => {
    const kits = app.container.resolve(onboardingServiceToken);
    // A position with its own kit, matched regardless of case.
    expect((await kits.kitFor('dept-product', 'designer'))?.id).toBe(
      'kit-product-designer',
    );
    // Any other position takes the department's default.
    expect((await kits.kitFor('dept-product', 'Product Manager'))?.id).toBe(
      'kit-product',
    );
    // A department with no kit of its own takes its parent's.
    const team = await create('master/departments', {
      name: 'Web team',
      parentId: 'dept-rd',
    });
    expect((await kits.kitFor(team.id, null))?.id).toBe('kit-rd');
    // Technology itself has none, and nothing above it.
    expect(await kits.kitFor('dept-tech', null)).toBeNull();
  });

  it('proposes a device in stock, and counts it once it is reserved', async () => {
    const laptop = await create('devices', {
      modelId: 'model-macbook-pro-14-m3',
      serialNo: 'C02TEST0001',
      locationId,
    });
    const joiner = await person('Sun Hao', 'dept-rd', 'Frontend Engineer');
    const before = await plan(joiner.id);
    expect(before.kit?.id).toBe('kit-rd');
    const macbook = () =>
      plan(joiner.id).then((current) =>
        current.lines.find(
          (line) => line.target.id === 'model-macbook-pro-14-m3',
        )!,
      );
    expect((await macbook()).proposals).toEqual([
      expect.objectContaining({ type: 'device', id: laptop.id }),
    ]);

    // Reserved until the joining day: prepared, and no longer proposed.
    const reserved = await post(`devices/${laptop.id}/reserve`, {
      reservedForType: 'person',
      reservedForId: joiner.id,
      reservedUntil: addDays(today(), 5),
    });
    expect(reserved.status).toBe(200);
    const line = await macbook();
    expect(line.preparedCount).toBe(1);
    expect(line.prepared[0]).toMatchObject({
      id: laptop.id,
      state: 'reserved',
    });
    expect(line.proposals).toEqual([]);
    expect((await plan(joiner.id)).prepared).toBe(before.prepared + 1);
  });

  it("puts a per-device licence's seat on the joiner's computer (2026-10-28)", async () => {
    const licence = await create('entitlements', {
      kind: 'perpetual',
      softwareProductId: 'sp-intellij-idea',
      name: 'IDE per device',
      licensingModel: 'perDevice',
      seatCount: 2,
    });
    const joiner = await person('Sun Hao', 'dept-rd', 'Frontend Engineer');
    const ide = async () =>
      (
        await data<{
          lines: {
            target: { id: string };
            preparedCount: number;
            shortfall: number;
            proposals: {
              id: string;
              holder?: { type: string; id: string };
              needsDevice?: boolean;
              needsAccount?: boolean;
              holderChoices?: { id: string }[];
            }[];
          }[];
        }>(
          await app.request(
            `/api/itam/master/people/${joiner.id}/onboarding`,
            manager,
          ),
        )
      ).lines.find((line) => line.target.id === 'sp-intellij-idea')!;
    // No computer of theirs yet: the seat is there, and waits for one; it is
    // not something to buy.
    expect(await ide()).toMatchObject({
      shortfall: 0,
      proposals: [{ id: licence.id, needsDevice: true }],
    });

    // A monitor of theirs is not where the licence goes: only the device
    // making up the kit's first device item, the computer.
    const monitor = await create('devices', {
      modelId: 'model-u2723qe',
      serialNo: 'MONTEST0001',
      locationId,
    });
    await post(`devices/${monitor.id}/reserve`, {
      reservedForType: 'person',
      reservedForId: joiner.id,
      reservedUntil: addDays(today(), 5),
    });
    expect(await ide()).toMatchObject({
      proposals: [{ id: licence.id, needsDevice: true, holderChoices: [] }],
    });

    const laptop = await create('devices', {
      modelId: 'model-macbook-pro-14-m3',
      serialNo: 'C02TEST0002',
      locationId,
    });
    await post(`devices/${laptop.id}/reserve`, {
      reservedForType: 'person',
      reservedForId: joiner.id,
      reservedUntil: addDays(today(), 5),
    });
    const proposal = (await ide()).proposals[0]!;
    expect(proposal).toMatchObject({
      id: licence.id,
      holder: { type: 'device', id: laptop.id },
    });
    expect(proposal.needsDevice).toBeUndefined();
    expect(proposal.needsAccount).toBeUndefined();

    // Carried out as the card does: the seat goes to the computer, and
    // counts as theirs.
    const assigned = await post(`entitlements/${licence.id}/assign-seats`, {
      seats: [{ holderType: 'device', holderId: laptop.id }],
    });
    expect(assigned.status).toBe(200);
    expect(await ide()).toMatchObject({ preparedCount: 1, proposals: [] });
  });

  it('gives a per-device licence asked for twice to two of their computers, each one choosable', async () => {
    // R&D's kit asks for the IDE twice.
    const kit = await data<{ items: Record<string, unknown>[] }>(
      await app.request('/api/itam/master/onboardingKits/kit-rd', manager),
    );
    await app.request('/api/itam/master/onboardingKits/kit-rd', {
      ...json({
        items: kit.items.map((item) =>
          item.softwareProductId === 'sp-intellij-idea'
            ? { ...item, quantity: 2 }
            : item,
        ),
      }),
      method: 'PATCH',
      ...manager,
    });
    const licence = await create('entitlements', {
      kind: 'perpetual',
      softwareProductId: 'sp-intellij-idea',
      name: 'IDE per device',
      licensingModel: 'perDevice',
      seatCount: 5,
    });
    const joiner = await person('Sun Hao', 'dept-rd', 'Frontend Engineer');
    const laptops: string[] = [];
    for (const serialNo of ['C02TEST0003', 'C02TEST0004']) {
      const laptop = await create('devices', {
        modelId: 'model-macbook-pro-14-m3',
        serialNo,
        locationId,
      });
      await post(`devices/${laptop.id}/reserve`, {
        reservedForType: 'person',
        reservedForId: joiner.id,
        reservedUntil: addDays(today(), 5),
      });
      laptops.push(laptop.id);
    }
    const line = (
      await data<{
        lines: {
          target: { id: string };
          proposals: {
            id: string;
            slot?: number;
            holder?: { id: string };
            holderChoices?: { id: string }[];
          }[];
        }[];
      }>(
        await app.request(
          `/api/itam/master/people/${joiner.id}/onboarding`,
          manager,
        ),
      )
    ).lines.find((entry) => entry.target.id === 'sp-intellij-idea')!;
    // One seat on each computer, told apart by slot, either one changeable
    // to any device of theirs.
    expect(line.proposals.map((proposal) => proposal.slot)).toEqual([0, 1]);
    expect(
      line.proposals.map((proposal) => proposal.holder?.id).sort(),
    ).toEqual([...laptops].sort());
    for (const proposal of line.proposals) {
      expect(proposal.id).toBe(licence.id);
      expect(
        (proposal.holderChoices ?? []).map((choice) => choice.id).sort(),
      ).toEqual([...laptops].sort());
    }
  });

  it('takes some of an item off as 不需要, and gives it back (2026-10-28)', async () => {
    const kit = await data<{ items: Record<string, unknown>[] }>(
      await app.request('/api/itam/master/onboardingKits/kit-rd', manager),
    );
    await app.request('/api/itam/master/onboardingKits/kit-rd', {
      ...json({
        items: kit.items.map((item) =>
          item.modelId === 'model-macbook-pro-14-m3'
            ? { ...item, quantity: 3 }
            : item,
        ),
      }),
      method: 'PATCH',
      ...manager,
    });
    const joiner = await person('Sun Hao', 'dept-rd', 'Frontend Engineer');
    const key = 'model:model-macbook-pro-14-m3';
    const macbook = async () =>
      (
        await data<{
          required: number;
          lines: {
            key: string;
            required: number;
            fewer: number;
            waived: boolean;
          }[];
        }>(
          await app.request(
            `/api/itam/master/people/${joiner.id}/onboarding`,
            manager,
          ),
        )
      ).lines.find((line) => line.key === key)!;
    expect(await macbook()).toMatchObject({ required: 3, fewer: 0 });
    const waive = (body: Record<string, unknown>) =>
      post(`master/people/${joiner.id}/onboarding/waive`, { key, ...body });

    expect((await waive({ fewer: 2 })).status).toBe(200);
    expect(await macbook()).toMatchObject({
      required: 1,
      fewer: 2,
      waived: false,
    });
    // Never all of it: that is the whole item's 不需要.
    expect((await waive({ fewer: 3 })).status).toBe(400);
    // Back to what the kit asks.
    expect((await waive({ fewer: 0 })).status).toBe(200);
    expect(await macbook()).toMatchObject({ required: 3, fewer: 0 });
  });

  it('counts what an open new-hire order already brings, and seats under their e-mail', async () => {
    const joiner = await create('master/people', {
      name: 'Lin Xue',
      departmentId: 'dept-product',
      position: 'Designer',
      email: 'lin.xue@example.com',
      locationId,
      hireDate: addDays(today(), 9),
    });
    const before = await data<{
      lines: {
        target: { id: string };
        shortfall: number;
        onOrder: number;
        proposals: { account?: string; needsAccount?: boolean }[];
      }[];
    }>(
      await app.request(
        `/api/itam/master/people/${joiner.id}/onboarding`,
        manager,
      ),
    );
    const macbook = before.lines.find(
      (line) => line.target.id === 'model-macbook-pro-14-m3',
    )!;
    // Nothing in stock: a shortfall, nothing on order yet.
    expect(macbook).toMatchObject({ shortfall: 1, onOrder: 0 });

    // A draft 新员工配备 order for their department and joining day.
    const { procurementServiceToken } =
      await import('../../server/providers/itam/procurement.js');
    const { databaseManagerToken } = await import('@nocobase/db');
    const vendor = await create('master/vendors', {
      name: 'Kit Vendor',
      types: ['equipment'],
    });
    const order = await app.container.resolve(procurementServiceToken).create(
      {
        reason: 'newHire',
        vendorId: vendor.id,
        departmentId: 'dept-product',
        neededBy: addDays(today(), 9),
      },
      { actorId: 'mia' },
      { scope: true } as never,
    );
    await app.container
      .resolve(databaseManagerToken)
      .query()
      .insertInto('purchaseOrderLines')
      .values({
        id: 'line-mac',
        purchaseOrderId: String(order.id),
        itemType: 'device',
        modelId: 'model-macbook-pro-14-m3',
        quantity: 1,
        receivedQuantity: 0,
        sort: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .execute();
    const after = await data<{
      orders: { id: string }[];
      lines: { target: { id: string }; shortfall: number; onOrder: number }[];
    }>(
      await app.request(
        `/api/itam/master/people/${joiner.id}/onboarding`,
        manager,
      ),
    );
    expect(after.orders.map((entry) => entry.id)).toEqual([String(order.id)]);
    expect(
      after.lines.find((line) => line.target.id === 'model-macbook-pro-14-m3'),
    ).toMatchObject({ shortfall: 0, onOrder: 1 });
  });

  it('shares stock, placed orders and what leavers hand back among joiners, earliest first', async () => {
    const { procurementServiceToken } =
      await import('../../server/providers/itam/procurement.js');
    const { databaseManagerToken } = await import('@nocobase/db');
    const db = app.container.resolve(databaseManagerToken).query();
    const MAC = 'model-macbook-pro-14-m3';
    type Line = {
      target: { id: string };
      proposals: { id: string }[];
      planned: {
        id: string;
        supply: {
          kind: string;
          availableOn: string | null;
          fromName?: string;
          orderNo?: string;
        };
      }[];
      onOrder: number;
      returning: number;
      shortfall: number;
      orderBy: string | null;
    };
    const macbook = async (id: string) =>
      (
        await data<{ lines: Line[] }>(
          await app.request(
            `/api/itam/master/people/${id}/onboarding`,
            manager,
          ),
        )
      ).lines.find((line) => line.target.id === MAC)!;

    // One laptop in stock.
    const stocked = await create('devices', {
      modelId: MAC,
      serialNo: 'C02SHARE001',
      locationId,
      warrantyEndDate: '2030-01-01',
    });
    // Somebody leaving in eight days with a laptop in good order: back and
    // made ready three days later.
    const leaver = await person('Lee Leaving', 'dept-rd', null, '2022-01-01');
    const returning = await create('devices', {
      modelId: MAC,
      serialNo: 'C02SHARE002',
      locationId,
      warrantyEndDate: '2030-01-01',
    });
    expect(
      (
        await post(`devices/${returning.id}/assign`, {
          targetType: 'person',
          targetId: leaver.id,
        })
      ).status,
    ).toBe(200);
    await app.request(`/api/itam/master/people/${leaver.id}`, {
      ...json({ leaveDate: addDays(today(), 8) }),
      method: 'PATCH',
      ...manager,
    });
    // A replenishment order already placed, one laptop due in twelve days.
    const vendor = await create('master/vendors', {
      name: 'Share Vendor',
      types: ['equipment'],
    });
    const order = await app.container
      .resolve(procurementServiceToken)
      .create(
        { reason: 'stockReplenishment', vendorId: vendor.id },
        { actorId: 'mia' },
        { scope: true } as never,
      );
    await db
      .insertInto('purchaseOrderLines')
      .values({
        id: 'line-share',
        purchaseOrderId: String(order.id),
        itemType: 'device',
        modelId: MAC,
        quantity: 1,
        receivedQuantity: 0,
        sort: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .execute();
    await db
      .updateTable('purchaseOrders')
      .set({ status: 'ordered', expectedAt: addDays(today(), 12) })
      .where('id', '=', String(order.id))
      .execute();

    // Entered in this order, joining in another: the earliest first day
    // goes first, whoever was entered first.
    const joining = (name: string, days: number) =>
      person(name, 'dept-rd', null, addDays(today(), days));
    const last = await joining('Dan Last', 30);
    const third = await joining('Bo Third', 20);
    const second = await joining('Cy Second', 9);
    const first = await joining('Al First', 5);

    // The first gets the laptop in stock, and nobody else is offered it.
    expect((await macbook(first.id)).proposals).toEqual([
      expect.objectContaining({ id: stocked.id }),
    ]);
    // Nothing arrives by the second's first day: the order is made ready
    // on day 15 and the leaver's laptop on day 11. A shortfall, to order
    // ten days ahead (three to make it ready, seven to arrive).
    expect(await macbook(second.id)).toMatchObject({
      proposals: [],
      planned: [],
      shortfall: 1,
      orderBy: addDays(today(), 9 - 10),
    });
    // The order before what comes back: certain before uncertain.
    expect(await macbook(third.id)).toMatchObject({
      proposals: [],
      planned: [
        {
          id: String(order.id),
          supply: { kind: 'order', availableOn: addDays(today(), 15) },
        },
      ],
      onOrder: 1,
      shortfall: 0,
      orderBy: null,
    });
    expect(await macbook(last.id)).toMatchObject({
      planned: [
        {
          id: returning.id,
          supply: {
            kind: 'return',
            availableOn: addDays(today(), 11),
            fromName: 'Lee Leaving',
          },
        },
      ],
      returning: 1,
      shortfall: 0,
    });

    // Reserved for the first, the laptop leaves stock; the plans stay the
    // same, since it was already theirs.
    await post(`devices/${stocked.id}/reserve`, {
      reservedForType: 'person',
      reservedForId: first.id,
      reservedUntil: addDays(today(), 5),
    });
    expect((await macbook(second.id)).shortfall).toBe(1);
    // Due for replacement before it is back, the leaver's laptop is not
    // handed on.
    await db
      .updateTable('devices')
      .set({ plannedReplacementDate: addDays(today(), 10) })
      .where('id', '=', returning.id)
      .execute();
    expect(await macbook(last.id)).toMatchObject({ planned: [], shortfall: 1 });
  });

  it('lists a joiner as 入职准备 for the team until their kit is in hand', async () => {
    const joiner = await person('Lin Xue', 'dept-product', 'Designer');
    // However far off the first day: two months out is listed too, after.
    const later = await person(
      'Far Off',
      'dept-product',
      'Designer',
      addDays(today(), 60),
    );
    // Somebody who joined years ago is not joining.
    await person('Old Hand', 'dept-product', 'Designer', '2020-01-01');
    const card = async (scope?: 'mine') =>
      (
        await data<
          {
            key: string;
            count: number;
            records: { id: string; progress?: unknown }[];
          }[]
        >(
          await app.request(
            `/api/itam/workbench/my-work${scope ? `?scope=${scope}` : ''}`,
            manager,
          ),
        )
      ).find((item) => item.key === 'pendingOnboarding');
    const all = await card();
    expect(all?.records.map((record) => record.id)).toEqual([
      joiner.id,
      later.id,
    ]);
    expect(all?.records[0]?.progress).toEqual({
      done: 0,
      total: (await plan(joiner.id)).required,
    });
    // 我负责的 is the joiners whose 入职负责人 the reader is — whoever
    // entered them, to start with.
    expect((await card('mine'))?.records.map((record) => record.id)).toEqual([
      joiner.id,
      later.id,
    ]);
    const stored = await data<{ onboardingOwnerId: string }>(
      await app.request(`/api/itam/master/people/${joiner.id}`, manager),
    );
    expect(stored.onboardingOwnerId).toBe('mia');
    // Handed to a colleague, it leaves the reader's view.
    await app.request(`/api/itam/master/people/${joiner.id}`, {
      ...json({ onboardingOwnerId: 'ann' }),
      method: 'PATCH',
      ...manager,
    });
    expect((await card('mine'))?.records.map((record) => record.id)).toEqual([
      later.id,
    ]);
  });

  it('makes a joiner 待入职 until their first day, and 在职 on it', async () => {
    const joiner = await person('Sun Hao', 'dept-rd', 'Frontend Engineer');
    const status = async () =>
      (
        await data<{ employmentStatus: string }>(
          await app.request(`/api/itam/master/people/${joiner.id}`, manager),
        )
      ).employmentStatus;
    expect(await status()).toBe('pending');
    const { masterDataServiceToken } =
      await import('../../server/providers/itam/master-data.js');
    // The nightly status task, on the joining day.
    const result = await app.container
      .resolve(masterDataServiceToken)
      .markDueLeavers(addDays(today(), 5));
    expect(result.joined).toBe(1);
    expect(await status()).toBe('active');
  });

  it('keeps a started joiner in 入职准备 until each item is in hand or not needed', async () => {
    // Started three weeks ago, entered since: still being equipped.
    const joiner = await person(
      'Zhou Lan',
      'dept-product',
      'Designer',
      addDays(today(), -21),
    );
    const listed = async () =>
      (
        await data<{ key: string; records: { id: string }[] }[]>(
          await app.request('/api/itam/workbench/my-work', manager),
        )
      )
        .find((item) => item.key === 'pendingOnboarding')
        ?.records.map((record) => record.id) ?? [];
    expect(await listed()).toContain(joiner.id);

    const service = app.container.resolve(onboardingServiceToken);
    const keys = (await service.plan(joiner.id))!.lines.map((line) => line.key);
    const waive = (key: string, waived: boolean) =>
      post(`master/people/${joiner.id}/onboarding/waive`, { key, waived });
    // Not needed, item by item: nothing proposed for it, and it counts on
    // neither side of 已配备 N / M.
    expect((await waive(keys[0]!, true)).status).toBe(200);
    const one = (await service.plan(joiner.id))!;
    expect(one.waived).toBe(1);
    expect(one.lines[0]).toMatchObject({
      waived: true,
      proposals: [],
      shortfall: 0,
    });
    for (const key of keys.slice(1)) await waive(key, true);
    expect(await listed()).not.toContain(joiner.id);

    // Taking a mark back: something is missing again.
    expect((await waive(keys[0]!, false)).status).toBe(200);
    expect(await listed()).toContain(joiner.id);

    // An item that is not in their kit, and somebody who may not edit people.
    expect((await waive('model:nothing', true)).status).toBe(400);
    const refused = await app.request(
      `/api/itam/master/people/${joiner.id}/onboarding/waive`,
      { ...json({ key: keys[0], waived: true }), user: 'li', role: 'employee' },
    );
    expect(refused.status).toBe(403);
  });

  it('lists a joiner among what a leaving 入职负责人 answers for, while they are joining', async () => {
    const recent = await person('Sun Hao', 'dept-rd', 'Frontend Engineer');
    const long = await person('Old Hand', 'dept-rd', 'Engineer', '2020-01-01');
    const masterData = app.container.resolve(
      (await import('../../server/providers/itam/master-data.js'))
        .masterDataServiceToken,
    );
    const { unrestricted } =
      await import('../../server/providers/itam/authz-filter.js');
    // mia entered both, so is 入职负责人 of both. mia's own person record
    // links the sign-in, the way a leaving IT person's does.
    const staff = await create('master/people', {
      name: 'Mia',
      departmentId: 'dept-it',
      userId: 'mia',
    });
    const rows = await masterData.personOwnedRecords(
      staff.id,
      new Map([['people', unrestricted('people', 'read')]]),
    );
    const ids = rows.map((row) => row.id);
    // The one joining now; not the one who joined years ago.
    expect(ids).toContain(recent.id);
    expect(ids).not.toContain(long.id);
  });

  it('keeps a department’s positions, with a kit for one or the default', async () => {
    const department = async (id: string) =>
      data<{ positions: string[] | null }>(
        await app.request(`/api/itam/master/departments/${id}`, manager),
      );
    // Seeded: every department starts with positions, spelled as the
    // designer kit spells its own, so the kit adds no second Designer.
    expect((await department('dept-product')).positions).toEqual([
      'Product Manager',
      'Designer',
    ]);
    expect((await department('dept-hr')).positions).toEqual([
      'Recruiter',
      'HR Business Partner',
    ]);
    // A person saved with a position the department lacks adds it.
    const joiner = await person('New Role', 'dept-product', 'Researcher');
    expect((await department('dept-product')).positions).toContain(
      'Researcher',
    );
    const kits = async () =>
      data<{
        defaultKit: { id: string } | null;
        inherited: unknown;
        positions: {
          name: string;
          kit: { id: string } | null;
          holders: number;
        }[];
      }>(
        await app.request(
          '/api/itam/master/departments/dept-product/onboarding-kits',
          manager,
        ),
      );
    const before = await kits();
    expect(before.defaultKit?.id).toBe('kit-product');
    expect(
      before.positions.find((entry) => entry.name === 'Designer'),
    ).toMatchObject({ kit: { id: 'kit-product-designer' }, holders: 0 });
    expect(
      before.positions.find((entry) => entry.name === 'Researcher'),
    ).toMatchObject({ kit: null, holders: 1 });

    const setPositions = (positions: string[]) =>
      app.request('/api/itam/master/departments/dept-product', {
        ...json({ positions }),
        method: 'PATCH',
        ...manager,
      });
    // Held by somebody: it stays.
    const refused = await setPositions(['Designer']);
    expect(refused.status).toBe(422);
    expect(await refused.json()).toMatchObject({ rule: 'POSITION_IN_USE' });
    // Held by nobody: it goes, and its own kit with it.
    expect((await setPositions(['Researcher'])).status).toBe(200);
    const after = await kits();
    expect(after.positions.map((entry) => entry.name)).toEqual(['Researcher']);
    expect(
      (
        await app.request(
          '/api/itam/master/onboardingKits/kit-product-designer',
          manager,
        )
      ).status,
    ).toBe(404);
    expect(joiner.id).toBeTruthy();
  });

  it('counts a 待入职 joiner among the department’s people', async () => {
    const joiner = await person('Sun Hao', 'dept-rd', 'Frontend Engineer');
    const stats = await data<{ counts: { people: number } }>(
      await app.request('/api/itam/master/departments/dept-rd/stats', manager),
    );
    expect(stats.counts.people).toBe(1);
    const counts = await data<Record<string, Record<string, number>>>(
      await app.request('/api/itam/master/departments/counts', manager),
    );
    expect(counts.people?.['dept-rd']).toBe(1);
    expect(joiner.id).toBeTruthy();
  });

  it('shows the kit a department takes from above when it has none', async () => {
    const team = await create('master/departments', {
      name: 'Web team',
      parentId: 'dept-rd',
    });
    const result = await data<{
      defaultKit: unknown;
      inherited: { department: { id: string }; kit: { id: string } } | null;
      inheritable: boolean;
    }>(
      await app.request(
        `/api/itam/master/departments/${team.id}/onboarding-kits`,
        manager,
      ),
    );
    expect(result.defaultKit).toBeNull();
    expect(result.inherited).toMatchObject({
      department: { id: 'dept-rd' },
      kit: { id: 'kit-rd' },
    });
    expect(result.inheritable).toBe(true);
    // R&D has its own, and nothing above it to fall back on: 技术部 has no
    // kit of its own and no parent (2026-10-21).
    const rd = await data<{ defaultKit: unknown; inheritable: boolean }>(
      await app.request(
        '/api/itam/master/departments/dept-rd/onboarding-kits',
        manager,
      ),
    );
    expect(rd.defaultKit).not.toBeNull();
    expect(rd.inheritable).toBe(false);
  });

  it("tells a kit's changes on its department's history", async () => {
    // R&D's kit loses its dock, gets a second monitor and gains a mouse.
    const kit = await data<{ items: Record<string, unknown>[] }>(
      await app.request('/api/itam/master/onboardingKits/kit-rd', manager),
    );
    const items = kit.items
      .filter((item) => item.modelId !== 'model-wd22tb4')
      .map((item) =>
        item.modelId === 'model-u2723qe' ? { ...item, quantity: 2 } : item,
      );
    expect(
      (
        await app.request('/api/itam/master/onboardingKits/kit-rd', {
          ...json({ items }),
          method: 'PATCH',
          ...manager,
        })
      ).status,
    ).toBe(200);
    const timeline = await data<
      { event: { type: string; payload: Record<string, unknown> } | null }[]
    >(
      await app.request(
        '/api/itam/master/departments/dept-rd/history',
        manager,
      ),
    );
    const changed = timeline.find(
      (item) => item.event?.type === 'onboardingKitChanged',
    )?.event;
    expect(changed?.payload).toMatchObject({
      position: null,
      added: [],
      removed: [{ quantity: 1 }],
      changed: [{ from: 1, to: 2 }],
    });
    // By name, not by id.
    expect(
      (changed?.payload.removed as { label: string }[])[0]?.label,
    ).not.toBe('model-wd22tb4');
  });

  it('renames a held position, its holders and its kit with it', async () => {
    const designer = await person('Dana Design', 'dept-product', 'Designer');
    const rename = (to: string) =>
      app.request(
        '/api/itam/master/departments/dept-product/positions/rename',
        {
          ...json({ from: 'Designer', to }),
          ...manager,
        },
      );
    // Another position's name is refused.
    const taken = await rename('product manager');
    expect(taken.status).toBe(422);
    expect(await taken.json()).toMatchObject({ rule: 'POSITION_TAKEN' });

    expect((await rename('UX Designer')).status).toBe(200);
    const department = await data<{ positions: string[] }>(
      await app.request('/api/itam/master/departments/dept-product', manager),
    );
    expect(department.positions).toEqual(['Product Manager', 'UX Designer']);
    const holder = await data<{ position: string }>(
      await app.request(`/api/itam/master/people/${designer.id}`, manager),
    );
    expect(holder.position).toBe('UX Designer');
    const kit = await data<{ position: string }>(
      await app.request(
        '/api/itam/master/onboardingKits/kit-product-designer',
        manager,
      ),
    );
    expect(kit.position).toBe('UX Designer');
  });

  it('takes a deleted model out of the kits that named it', async () => {
    const model = await create('master/models', {
      name: 'Short-lived dock',
      manufacturerId: 'mfr-dell',
      categoryId: 'cat-dock',
    });
    const kit = await data<{ items: Record<string, unknown>[] }>(
      await app.request('/api/itam/master/onboardingKits/kit-rd', manager),
    );
    await app.request('/api/itam/master/onboardingKits/kit-rd', {
      ...json({ items: [...kit.items, { modelId: model.id, quantity: 1 }] }),
      method: 'PATCH',
      ...manager,
    });
    expect(
      (
        await app.request(`/api/itam/master/models/${model.id}`, {
          method: 'DELETE',
          ...manager,
        })
      ).status,
    ).toBeLessThan(300);
    const after = await data<{ items: Record<string, unknown>[] }>(
      await app.request('/api/itam/master/onboardingKits/kit-rd', manager),
    );
    expect(after.items.map((item) => item.modelId)).not.toContain(model.id);
    expect(after.items).toHaveLength(kit.items.length);
  });

  it('keeps one kit per department and position, each item one thing', async () => {
    // Research & Development already has its default kit.
    const duplicate = await post('master/onboardingKits', {
      name: 'Another R&D kit',
      departmentId: 'dept-rd',
      items: [],
    });
    expect(duplicate.status).toBe(409);
    // A position of its own is a different kit.
    const tester = await post('master/onboardingKits', {
      name: 'R&D tester kit',
      departmentId: 'dept-rd',
      position: 'QA Engineer',
      items: [{ modelId: 'model-latitude-5440', quantity: 1 }],
    });
    expect(tester.status).toBe(201);
    // An item naming two things at once is refused.
    const both = await post('master/onboardingKits', {
      name: 'Odd kit',
      departmentId: 'dept-sales',
      position: 'Intern',
      items: [
        {
          modelId: 'model-latitude-5440',
          softwareProductId: 'sp-figma',
          quantity: 1,
        },
      ],
    });
    expect(both.status).toBe(400);
  });
});
