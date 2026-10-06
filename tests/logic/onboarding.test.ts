// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { addDays, today } from '../../server/providers/itam/dates.js';
import { onboardingServiceToken } from '../../server/providers/itam/onboarding.js';
import { deviceRoutes } from '../../server/routes/itam/devices.js';
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
    for (const routes of [masterDataRoutes, deviceRoutes, workbenchRoutes])
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
        positions: { name: string; kit: { id: string } | null; holders: number }[];
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
