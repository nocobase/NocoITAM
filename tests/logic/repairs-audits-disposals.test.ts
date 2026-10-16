// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { approvalRoutes } from '../../server/routes/itam/approvals.js';
import { deviceRoutes } from '../../server/routes/itam/devices.js';
import { auditRoutes } from '../../server/routes/itam/audits.js';
import { disposalRoutes } from '../../server/routes/itam/disposals.js';
import { workbenchRoutes } from '../../server/routes/itam/workbench.js';
import { masterDataRoutes } from '../../server/routes/itam/master-data.js';
import { purchaseOrderRoutes } from '../../server/routes/itam/purchase-orders.js';
import { repairRoutes } from '../../server/routes/itam/repairs.js';
import { entitlementRoutes } from '../../server/routes/itam/entitlements.js';
import { stockRoutes } from '../../server/routes/itam/stock.js';
import { createTestApp, json, type TestApp } from '../support/test-app.js';

const manager = { user: 'mia', role: 'manager' as const };
const approver = { user: 'ann', role: 'manager' as const };
const employee = { user: 'li', role: 'employee' as const };
const stranger = { user: 'zhang', role: 'employee' as const };

interface Fixture {
  readonly vendorId: string;
  readonly locationId: string;
  readonly otherLocationId: string;
  readonly modelId: string;
  readonly personId: string;
  readonly otherPersonId: string;
  readonly licenseId: string;
  readonly componentId: string;
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
  const ram = await create('master/categories', {
    name: 'Memory',
    appliesTo: 'component',
  });
  const software = await create('master/categories', {
    name: 'Design',
    appliesTo: 'entitlement',
  });
  const departmentId = await create('master/departments', { name: 'R&D' });
  const locationId = await create('master/locations', {
    name: 'HQ',
    type: 'company',
  });
  const productId = await create('master/softwareProducts', {
    name: 'Test Figma',
    categoryId: software,
    deliveryMethod: 'onPremise',
  });
  return {
    vendorId: await create('master/vendors', {
      name: 'Repair shop',
      types: ['repairProvider'],
    }),
    locationId,
    otherLocationId: await create('master/locations', {
      name: 'Branch',
      type: 'building',
      parentId: locationId,
    }),
    modelId: await create('master/models', {
      name: 'MacBook Pro 14',
      categoryId: laptop,
      manufacturerId,
    }),
    personId: await create('master/people', {
      name: 'Li Na',
      departmentId,
      userId: employee.user,
    }),
    otherPersonId: await create('master/people', {
      name: 'Zhang Wei',
      departmentId,
      userId: stranger.user,
    }),
    licenseId: await create('entitlements', {
      kind: 'perpetual',
      name: 'Figma Pro',
      softwareProductId: productId,
      licensingModel: 'perDevice',
      seatCount: 5,
    }),
    componentId: await create('stock', {
      kind: 'component',
      name: '16 GB RAM',
      categoryId: ram,
      modelId: await create('master/models', {
        name: '16 GB DDR5',
        categoryId: ram,
        manufacturerId,
      }),
      locationId,
      totalQuantity: 10,
    }),
  };
}

describe('repairs, audits and disposals', () => {
  let app: TestApp;
  let fixture: Fixture;
  const post = (
    path: string,
    body: Record<string, unknown> = {},
    who: { user: string; role: 'employee' | 'support' | 'manager' } = manager,
  ) => app.request(`/api/itam/${path}`, { ...json(body), ...who });
  const get = (
    path: string,
    who: { user: string; role: 'employee' | 'support' | 'manager' } = manager,
  ) => app.request(`/api/itam/${path}`, who);
  const data = async <T = Record<string, unknown>>(
    response: Response,
  ): Promise<T> => ((await response.json()) as { data: T }).data;
  const createDevice = async (body: Record<string, unknown> = {}) => {
    const response = await post('devices', {
      modelId: fixture.modelId,
      locationId: fixture.locationId,
      serialNo: `SN-${Math.random().toString(36).slice(2, 8)}`,
      ...body,
    });
    expect(response.status).toBe(201);
    return data<{ id: string; deviceNo: string; status: string }>(response);
  };
  const assign = async (deviceId: string, personId: string) => {
    const response = await post(`devices/${deviceId}/assign`, {
      targetType: 'person',
      targetId: personId,
    });
    expect(response.status).toBe(200);
  };

  beforeEach(async () => {
    app = await createTestApp({ seeds: true });
    for (const routes of [
      masterDataRoutes,
      deviceRoutes,
      stockRoutes,
      entitlementRoutes,
      purchaseOrderRoutes,
      approvalRoutes,
      repairRoutes,
      auditRoutes,
      disposalRoutes,
      workbenchRoutes,
    ]) {
      await app.mount(routes);
    }
    fixture = await seedFixture(app);
  });

  afterEach(async () => {
    await app.destroy();
  });

  it('deletes a repair created by mistake, restoring the device', async () => {
    const device = await createDevice();
    await assign(device.id, fixture.personId);
    const repair = await data(
      await post('repairs', {
        deviceId: device.id,
        method: 'internal',
        expectedReturnAt: '2030-01-01',
        faultDescription: 'Wrong device',
      }),
    );
    expect(await data(await get(`devices/${device.id}`))).toMatchObject({
      status: 'inRepair',
    });
    const removed = await app.request(
      `/api/itam/repairs/${String(repair.id)}`,
      {
        method: 'DELETE',
        ...manager,
      },
    );
    expect(removed.status).toBe(200);
    expect(await data(await get(`devices/${device.id}`))).toMatchObject({
      status: 'inUse',
      assigneeId: fixture.personId,
    });
  });

  it('puts an approved disposal on the to-do of the people it went through', async () => {
    const device = await createDevice();
    const disposal = await data<{ id: string; disposalNo: string }>(
      await post('disposals', {
        recipientName: 'Recycler',
        method: 'scrap',
        reason: 'damaged',
        deviceIds: [device.id],
        dataWipe: 'notRequired',
      }),
    );
    // 我负责的: the reader's part of the team's queue.
    const work = async (who: typeof manager, scope = 'mine') =>
      data<{ key: string; count: number; records: { title: string }[] }[]>(
        await app.request(`/api/itam/workbench/my-work?scope=${scope}`, who),
      );
    const pending = async (who: typeof manager) =>
      (await work(who)).find((item) => item.key === 'pendingDisposalExecution');
    // Only once it is approved: a draft is not waiting to be carried out.
    expect((await pending(manager))?.count).toBe(0);
    await post(`disposals/${disposal.id}/submit`, {
      approverId: approver.user,
    });
    await post(
      `disposals/${disposal.id}/decide`,
      { decision: 'approved' },
      approver,
    );
    // The requesting side's, and theirs alone. The approver may carry it
    // out too (`NOT_INVOLVED`), but that is a permission, not their work —
    // the card stays narrower than the rule, never wider.
    expect((await pending(manager))?.records.map((row) => row.title)).toEqual([
      disposal.disposalNo,
    ]);
    expect((await pending(approver))?.count).toBe(0);
    // The team's queue, everybody's default, lists it for the approver too.
    expect(
      (await work(approver, 'all')).find(
        (item) => item.key === 'pendingDisposalExecution',
      )?.count,
    ).toBe(1);
  });

  /**
   * A disposal waiting for a decision is not editable at all, but it is
   * still somebody's to follow through — so its 负责人 may be handed over by
   * anybody who may update it, the same as an order's.
   */
  it('lets anybody hand over a disposal waiting for a decision', async () => {
    const device = await createDevice();
    const disposal = await data<{ id: string }>(
      await post('disposals', {
        recipientName: 'Recycler',
        method: 'scrap',
        reason: 'damaged',
        deviceIds: [device.id],
        dataWipe: 'notRequired',
      }),
    );
    await post(`disposals/${disposal.id}/submit`, {
      approverId: approver.user,
    });
    const patch = (body: Record<string, unknown>) =>
      app.request(`/api/itam/disposals/${disposal.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        ...approver,
      });
    const handed = await patch({ ownerId: approver.user });
    expect(handed.status).toBe(200);
    expect((await data<{ ownerId: string }>(handed)).ownerId).toBe(
      approver.user,
    );
    // Anything else is still an edit, which waiting for a decision refuses.
    expect((await patch({ description: 'rewritten' })).status).toBe(422);
  });

  /**
   * A repair is its 负责人's to finish, or a supervisor's: whoever may clear
   * a repair away — `delete`, the asset manager's and root's — may also close
   * one somebody else follows, so a repair whose 负责人 is away is not stuck.
   * IT support holds `complete` and not `delete`, so it finishes only its
   * own; deleting is the grant's alone.
   */
  it('lets its 负责人 finish a repair, and a supervisor any of them', async () => {
    const support = { user: 'sam', role: 'support' as const };
    const repairOf = async () =>
      data<{ id: string; ownerId: string }>(
        await post('repairs', {
          deviceId: (await createDevice()).id,
          method: 'internal',
          expectedReturnAt: '2030-01-01',
          faultDescription: 'Fan rattles',
        }),
      );
    const finish = (id: string, who: typeof manager | typeof support) =>
      post(`repairs/${id}/complete`, { result: 'repaired' }, who);
    const remove = (id: string, who: typeof manager | typeof support) =>
      app.request(`/api/itam/repairs/${id}`, { method: 'DELETE', ...who });

    const repair = await repairOf();
    // Nobody is asked on creation: it is whoever files it, until handed over.
    expect(repair.ownerId).toBe(manager.user);

    // IT support holds the grant to finish, but this one is not theirs …
    const byColleague = await finish(repair.id, support);
    expect(byColleague.status).toBe(422);
    expect(await byColleague.json()).toMatchObject({ rule: 'NOT_OWNER' });
    // … and deleting is not theirs at all.
    expect((await remove(repair.id, support)).status).toBe(403);

    // Handed over, it is: the right moves with the name.
    await app.request(`/api/itam/repairs/${repair.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ownerId: support.user }),
      ...manager,
    });
    expect((await finish(repair.id, support)).status).toBe(200);

    // A supervisor closes one somebody else follows, and clears one away.
    expect((await finish((await repairOf()).id, approver)).status).toBe(200);
    expect((await remove((await repairOf()).id, approver)).status).toBe(200);

    // Finished, it keeps the 负责人 who saw it through: that is history now,
    // as it is for a closed order or stocktake.
    const reassigned = await app.request(`/api/itam/repairs/${repair.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ownerId: manager.user }),
      ...manager,
    });
    expect(reassigned.status).toBe(422);
    // Its other corrections stay open.
    const corrected = await app.request(`/api/itam/repairs/${repair.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ notes: 'Fan replaced' }),
      ...manager,
    });
    expect(corrected.status).toBe(200);
  });

  it('refuses a disposal that does not say where the devices go', async () => {
    const device = await createDevice();
    const refused = await post('disposals', {
      method: 'scrap',
      reason: 'damaged',
      deviceIds: [device.id],
    });
    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({
      code: 'VALIDATION',
      field: 'recipientVendorId',
    });
  });

  it('lists the disposals a device is on, newest first, for its page', async () => {
    const device = await createDevice();
    const first = await data(
      await post('disposals', {
        recipientName: 'Recycler',
        method: 'scrap',
        reason: 'damaged',
        deviceIds: [device.id],
      }),
    );
    // Withdrawn / rejected drafts free the device for another disposal.
    await app.request(`/api/itam/disposals/${String(first.id)}`, {
      method: 'DELETE',
      ...manager,
    });
    const second = await data(
      await post('disposals', {
        recipientName: 'Recycler',
        method: 'sale',
        reason: 'endOfLife',
        deviceIds: [device.id],
      }),
    );
    const listed = await data(await get(`disposals/for-device/${device.id}`));
    expect(listed.map((row: Record<string, unknown>) => row.id)).toEqual([
      second.id,
    ]);
    // An employee who may not read disposals gets nothing, not an error.
    const asEmployee = await app.request(
      `/api/itam/disposals/for-device/${device.id}`,
      { headers: { 'x-test-user': 'ann', 'x-test-role': 'employee' } },
    );
    expect([200, 403]).toContain(asEmployee.status);
  });

  it('numbers repairs RP-000001 onwards and lists them by number', async () => {
    const device = await createDevice();
    const created = await data(
      await post('repairs', {
        deviceId: device.id,
        method: 'internal',
        expectedReturnAt: '2030-01-01',
        faultDescription: 'Numbered',
      }),
    );
    expect(String(created.repairNo)).toMatch(/^RP-\d{6}$/);
    const listed = await data(
      await get(`repairs?q=${encodeURIComponent(String(created.repairNo))}`),
    );
    expect(listed.map((row: Record<string, unknown>) => row.id)).toEqual([
      created.id,
    ]);
    // The number is assigned, never edited.
    expect(
      (
        await app.request(`/api/itam/repairs/${String(created.id)}`, {
          ...json({ repairNo: 'RP-999999' }),
          method: 'PATCH',
          ...manager,
        })
      ).status,
    ).toBe(400);
  });

  it('deletes a finished repair without touching the device', async () => {
    const device = await createDevice();
    await assign(device.id, fixture.personId);
    const repair = await data(
      await post('repairs', {
        deviceId: device.id,
        method: 'internal',
        expectedReturnAt: '2030-01-01',
        faultDescription: 'Cracked screen',
      }),
    );
    await post(`repairs/${String(repair.id)}/complete`, {
      result: 'unrepairable',
      disposition: 'dispose',
    });
    const query = app.db.database.query();
    const links = () =>
      query
        .selectFrom('attachmentLinks')
        .select('id')
        .where('ownerType', '=', 'repairs')
        .where('ownerId', '=', String(repair.id))
        .execute();
    await query
      .insertInto('attachmentLinks')
      .values({
        id: 'repair-quote',
        fileId: 'file-quote',
        ownerType: 'repairs',
        ownerId: String(repair.id),
        uploadedById: 'mia',
        createdAt: new Date(),
      })
      .execute();
    expect(await links()).toHaveLength(1);
    const removed = await app.request(
      `/api/itam/repairs/${String(repair.id)}`,
      { method: 'DELETE', ...manager },
    );
    expect(removed.status).toBe(200);
    expect((await get(`repairs/${String(repair.id)}`)).status).toBe(404);
    // Its attachments go with it.
    expect(await links()).toHaveLength(0);
    // The completion already moved the device; deleting the record does not
    // move it back.
    expect(await data(await get(`devices/${device.id}`))).toMatchObject({
      status: 'pendingDisposal',
    });
  });

  it('lets a finished repair correct its result, return date and notes, not one in progress', async () => {
    const device = await createDevice();
    await assign(device.id, fixture.personId);
    const repair = await data(
      await post('repairs', {
        deviceId: device.id,
        method: 'internal',
        expectedReturnAt: '2030-01-01',
        faultDescription: 'Loose hinge',
      }),
    );
    const patch = (body: Record<string, unknown>) =>
      app.request(`/api/itam/repairs/${String(repair.id)}`, {
        ...json(body),
        method: 'PATCH',
        ...manager,
      });
    // Still in progress: the outcome only changes by completing.
    expect((await patch({ result: 'repaired' })).status).toBe(422);
    expect((await patch({ actualReturnAt: '2030-01-05' })).status).toBe(422);
    await post(`repairs/${String(repair.id)}/complete`, { result: 'repaired' });
    // The repair's own timeline tells the completion as one line, with the
    // fields it set folded under it.
    const timeline = await data<
      {
        event?: { type: string; payload: Record<string, unknown> };
        changes: { field?: string }[];
      }[]
    >(await get(`repairs/${String(repair.id)}/history`));
    const completed = timeline.find(
      (item) => item.event?.type === 'repairCompleted',
    );
    expect(completed?.event?.payload).toEqual({
      result: 'repaired',
      disposition: 'return',
    });
    expect(completed?.changes.map((change) => change.field)).toEqual(
      expect.arrayContaining(['result', 'actualReturnAt']),
    );
    // Finished: corrections are fine, but never back to in progress.
    const corrected = await patch({
      result: 'unrepairable',
      actualReturnAt: '2030-01-05',
      notes: 'Hinge replaced with a used part',
    });
    expect(corrected.status).toBe(200);
    expect(await data(corrected)).toMatchObject({
      result: 'unrepairable',
      actualReturnAt: '2030-01-05',
      notes: 'Hinge replaced with a used part',
    });
    expect((await patch({ result: 'inProgress' })).status).toBe(400);
    // Correcting the record does not move the device again.
    expect(await data(await get(`devices/${device.id}`))).toMatchObject({
      status: 'inUse',
    });
  });

  it('keeps an unrepairable device in use unless sent to disposal', async () => {
    const usable = await createDevice();
    await assign(usable.id, fixture.personId);
    const first = await data(
      await post('repairs', {
        deviceId: usable.id,
        method: 'internal',
        expectedReturnAt: '2030-01-01',
        faultDescription: 'Dead pixel',
      }),
    );
    // Could not be fixed, but the device goes back to its holder by default.
    expect(
      (
        await post(`repairs/${String(first.id)}/complete`, {
          result: 'unrepairable',
        })
      ).status,
    ).toBe(200);
    expect(await data(await get(`devices/${usable.id}`))).toMatchObject({
      status: 'inUse',
      assigneeId: fixture.personId,
    });
    // The same result with an explicit disposition sends it to disposal.
    const second = await data(
      await post('repairs', {
        deviceId: usable.id,
        method: 'internal',
        expectedReturnAt: '2030-01-01',
        faultDescription: 'Board failure',
      }),
    );
    expect(
      (
        await post(`repairs/${String(second.id)}/complete`, {
          result: 'unrepairable',
          disposition: 'dispose',
        })
      ).status,
    ).toBe(200);
    expect(await data(await get(`devices/${usable.id}`))).toMatchObject({
      status: 'pendingDisposal',
      assigneeId: null,
    });
  });

  /**
   * A stocktake answers to its 负责人, which starts at whoever creates it and
   * moves when it is handed over — and 进行中的盘点 follows that, beside the
   * executors who count. It read the creator until 2026-10-05, which a
   * handed-over task left on the old organiser's list for ever.
   */
  it("gives a stocktake an owner, and puts it on that owner's to-do", async () => {
    await createDevice();
    const created = await post('audits', {
      name: 'Owned count',
      scope: { locationIds: [fixture.locationId] },
      plannedStart: '2026-09-01',
      plannedEnd: '2026-09-30',
      executorIds: ['sam'],
    });
    const task = await data<{ id: string; ownerId: string }>(created);
    // Not named, so whoever created it.
    expect(task.ownerId).toBe(manager.user);
    await post(`audits/${task.id}/start`);

    const active = async (who: typeof manager) =>
      (
        await data<{ key: string; records: { id: string }[] }[]>(
          await app.request('/api/itam/workbench/my-work?scope=mine', who),
        )
      ).find((item) => item.key === 'activeAudits')?.records ?? [];
    expect((await active(manager)).map((row) => row.id)).toEqual([task.id]);
    expect(await active(approver)).toEqual([]);

    // Handed over: it leaves the creator's list and joins the new owner's.
    await app.request(`/api/itam/audits/${task.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ownerId: approver.user }),
      ...manager,
    });
    expect(await active(manager)).toEqual([]);
    expect((await active(approver)).map((row) => row.id)).toEqual([task.id]);
  });

  it('runs an audit: snapshot, count, differences, resolution, last-audited stamps', async () => {
    const a1 = await createDevice();
    const a2 = await createDevice();
    const a3 = await createDevice({ locationId: fixture.otherLocationId });
    await assign(a2.id, fixture.personId);

    const created = await post('audits', {
      name: 'Q3 count',
      scope: { locationIds: [fixture.locationId] },
      plannedStart: '2026-09-01',
      plannedEnd: '2026-09-30',
      executorIds: ['ann'],
    });
    expect(created.status).toBe(201);
    const task = await data<{ id: string; expectedCount: number }>(created);
    // The scope includes the child location.
    expect(task.expectedCount).toBe(3);

    const started = await post(`audits/${task.id}/start`);
    expect(started.status).toBe(200);
    expect((await data(started)).status).toBe('inProgress');
    expect(app.notifications.at(-1)?.to.id).toBe('ann');
    const items = await data<
      { id: string; deviceId: string; result: string }[]
    >(await get(`audits/${task.id}/items`));
    expect(items).toHaveLength(3);
    const item = (deviceId: string) =>
      items.find((entry) => entry.deviceId === deviceId)?.id;

    const counted = await post(`audits/${task.id}/count`, {
      items: [
        { itemId: item(a1.id), result: 'matched' },
        {
          itemId: item(a2.id),
          result: 'mismatch',
          actualAssigneeId: fixture.otherPersonId,
          actualAssigneeType: 'person',
        },
      ],
    });
    expect(counted.status).toBe(200);
    expect((await data(counted)).countedCount).toBe(2);
    const unregistered = await post(`audits/${task.id}/add-unregistered`, {
      label: 'Unknown Dell',
    });
    expect(unregistered.status).toBe(200);

    // Finishing marks the uncounted device as not found.
    const finished = await post(`audits/${task.id}/finish`);
    expect(finished.status).toBe(200);
    const pending = await data(finished);
    expect(pending.status).toBe('pendingDifferences');
    expect(pending.differenceCount).toBe(3);

    const after = await data<
      { id: string; deviceId: string; result: string; label: string }[]
    >(await get(`audits/${task.id}/items?result=notFound`));
    expect(after.map((entry) => entry.deviceId)).toEqual([a3.id]);
    const unregisteredItem = (
      await data<{ id: string; result: string }[]>(
        await get(`audits/${task.id}/items?result=unregistered`),
      )
    )[0];

    const resolved = await post(`audits/${task.id}/resolve`, {
      items: [
        { itemId: item(a2.id), resolution: 'updateToActual' },
        { itemId: item(a3.id), resolution: 'markLost' },
        {
          itemId: unregisteredItem.id,
          resolution: 'register',
          modelId: fixture.modelId,
          locationId: fixture.locationId,
          serialNo: 'DELL-1',
        },
      ],
    });
    expect(resolved.status).toBe(200);
    const completed = await data(resolved);
    expect(completed.status).toBe('completed');
    expect(completed.differenceCount).toBe(0);

    expect(
      (await data<{ assigneeId: string }>(await get(`devices/${a2.id}`)))
        .assigneeId,
    ).toBe(fixture.otherPersonId);
    expect(
      (await data<{ status: string }>(await get(`devices/${a3.id}`))).status,
    ).toBe('lost');
    const stamped = await data<{ lastAuditedAt: string | null }>(
      await get(`devices/${a1.id}`),
    );
    expect(stamped.lastAuditedAt).not.toBeNull();
    const registered = (await (
      await get('devices?filter[status]=inStock')
    ).json()) as { data: { name: string }[] };
    expect(registered.data.some((row) => row.name === 'Unknown Dell')).toBe(
      true,
    );
  });

  it('shows a task not started the devices its scope matches now, then snapshots them', async () => {
    const here = await createDevice();
    const there = await createDevice({ locationId: fixture.otherLocationId });
    const task = await data<{ id: string }>(
      await post('audits', {
        name: 'Live scope',
        scope: { deviceIds: [here.id] },
        plannedStart: '2026-10-01',
        plannedEnd: '2026-10-05',
        executorIds: ['ann'],
      }),
    );
    type Item = { id: string; deviceId: string; preview?: boolean };
    const items = async () =>
      data<Item[]>(await get(`audits/${task.id}/items`));
    expect((await items()).map((item) => item.deviceId)).toEqual([here.id]);
    expect((await items())[0]?.preview).toBe(true);

    // The scope is edited in place until the task starts.
    const patch = (body: Record<string, unknown>) =>
      app.request(`/api/itam/audits/${task.id}`, {
        ...json(body),
        method: 'PATCH',
        ...manager,
      });
    expect(
      (await patch({ scope: { deviceIds: [here.id, there.id] } })).status,
    ).toBe(200);
    expect((await items()).map((item) => item.deviceId).sort()).toEqual(
      [here.id, there.id].sort(),
    );
    expect((await patch({ executorIds: ['ann', 'mia'] })).status).toBe(200);

    await post(`audits/${task.id}/start`);
    const snapshot = await items();
    expect(snapshot).toHaveLength(2);
    expect(snapshot.every((item) => !item.preview)).toBe(true);
    // Started: the items are fixed, and so is the scope they came from.
    expect((await patch({ scope: { deviceIds: [here.id] } })).status).toBe(422);
  });

  it('deletes an audit not started yet rather than cancelling it', async () => {
    await createDevice();
    const created = await post('audits', {
      name: 'Planned count',
      scope: { locationIds: [fixture.locationId] },
      plannedStart: '2026-10-01',
      plannedEnd: '2026-10-05',
      executorIds: ['ann'],
    });
    const task = await data<{ id: string }>(created);
    // Nothing has happened to call off: a task not started is deleted.
    expect(
      (await post(`audits/${task.id}/cancel`, { reason: 'Not needed' })).status,
    ).toBe(422);
    const removed = await app.request(`/api/itam/audits/${task.id}`, {
      method: 'DELETE',
      ...manager,
    });
    expect(removed.status).toBe(200);

    const again = await data<{ id: string }>(
      await post('audits', {
        name: 'Started count',
        scope: { locationIds: [fixture.locationId] },
        plannedStart: '2026-10-01',
        plannedEnd: '2026-10-05',
        executorIds: ['ann'],
      }),
    );
    await post(`audits/${again.id}/start`);
    const cancelled = await post(`audits/${again.id}/cancel`, {
      reason: 'Moved to next quarter',
    });
    expect(cancelled.status).toBe(200);
    expect((await data(cancelled)).status).toBe('cancelled');
  });

  it('runs a disposal: approval reclaims seats and components, execution disposes', async () => {
    const device = await createDevice();
    await assign(device.id, fixture.personId);
    // A seat and a component sit on the device.
    expect(
      (
        await post(`entitlements/${fixture.licenseId}/assign-seats`, {
          seats: [{ holderType: 'device', holderId: device.id }],
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await post(`stock/${fixture.componentId}/issue`, {
          holderType: 'device',
          holderId: device.id,
          quantity: 2,
        })
      ).status,
    ).toBe(200);

    // The request states how it will be carried out: where the devices go
    // and what happens to the data on them.
    const created = await post('disposals', {
      method: 'scrap',
      reason: 'endOfLife',
      deviceIds: [device.id],
      recipientName: 'GreenLoop',
      dataWipe: 'wiped',
      wipeMethod: 'erase',
    });
    expect(created.status).toBe(201);
    const disposal = await data<{
      id: string;
      disposalNo: string;
      deviceCount: number;
    }>(created);
    expect(disposal.disposalNo).toBe('DP-000001');
    expect(disposal.deviceCount).toBe(1);

    // The same device cannot be listed twice across open disposals.
    expect(
      (
        await post('disposals', {
          recipientName: 'Recycler',
          method: 'sale',
          reason: 'other',
          deviceIds: [device.id],
        })
      ).status,
    ).toBe(422);

    const submitted = await post(`disposals/${disposal.id}/submit`, {
      approverId: 'ann',
    });
    expect(submitted.status).toBe(200);
    expect((await data(submitted)).status).toBe('pendingApproval');
    // Only the person it was addressed to decides it.
    expect(
      (
        await post(`disposals/${disposal.id}/decide`, {
          decision: 'approved',
        })
      ).status,
    ).toBe(422);
    const approved = await post(
      `disposals/${disposal.id}/decide`,
      { decision: 'approved' },
      approver,
    );
    expect(approved.status).toBe(200);
    expect((await data(approved)).status).toBe('approved');
    expect(app.notifications.at(-1)?.to.id).toBe(manager.user);

    const pending = await data<{ status: string; assigneeId: string | null }>(
      await get(`devices/${device.id}`),
    );
    expect(pending.status).toBe('pendingDisposal');
    expect(pending.assigneeId).toBeNull();
    const seats = await data<{ seats: unknown[] }>(
      await get(`entitlements/${fixture.licenseId}/seats`),
    );
    expect(seats.seats).toHaveLength(0);
    const component = await data<{ usedQuantity: number }>(
      await get(`stock/${fixture.componentId}`),
    );
    expect(component.usedQuantity).toBe(0);

    expect(
      (
        await post(`disposals/${disposal.id}/execute`, {
          dataWipe: 'wiped',
        })
      ).status,
    ).toBe(400);
    const executed = await post(`disposals/${disposal.id}/execute`, {
      dataWipe: 'wiped',
      wipeMethod: 'erase',
      proceeds: 0,
    });
    expect(executed.status).toBe(200);
    const result = await data<{
      status: string;
      recipientName: string | null;
      executedById: string | null;
    }>(executed);
    expect(result.status).toBe('executed');
    // What the execution did not mention stands, and who carried it out is
    // whoever executed it.
    expect(result.recipientName).toBe('GreenLoop');
    expect(result.executedById).toBe(manager.user);
    expect(
      (await data<{ status: string }>(await get(`devices/${device.id}`)))
        .status,
    ).toBe('disposed');
    // Disposed devices are read-only.
    expect(
      (
        await app.request(`/api/itam/devices/${device.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'x' }),
          ...manager,
        })
      ).status,
    ).toBe(422);
    const approvals = await data<{ status: string }[]>(
      await get(`disposals/${disposal.id}/approvals`),
    );
    expect(approvals[0]?.status).toBe('approved');

    // Its lifecycle, as the flowchart reads it: every move it made, by whom,
    // with nothing left to do from a final state, and the notifications the
    // moves owed, sent.
    const lifecycle = await data<{
      state: string;
      version: number;
      available: unknown[];
      history: { transition: string; from: string | null; actorId: string }[];
      effects: { effect: string; status: string }[];
    }>(await get(`disposals/${disposal.id}/lifecycle`));
    expect(lifecycle.state).toBe('executed');
    expect(
      lifecycle.history.map((entry) => [entry.transition, entry.actorId]),
    ).toEqual([
      ['$create', manager.user],
      ['submit', manager.user],
      ['approve', approver.user],
      ['execute', manager.user],
    ]);
    // Creation is a version of its own.
    expect(lifecycle.version).toBe(4);
    expect(lifecycle.available).toEqual([]);
    expect(lifecycle.effects.map((run) => [run.effect, run.status])).toEqual([
      ['disposals.notifyApprover', 'succeeded'],
      ['disposals.notifyDecision', 'succeeded'],
    ]);
    const described = await data<{
      description: { stateInfo: { name: string }[] };
    }>(await get('disposals/lifecycle'));
    expect(described.description.stateInfo.map((state) => state.name)).toEqual([
      'draft',
      'pendingApproval',
      'approved',
      'rejected',
      'executed',
    ]);
    expect(
      (await app.request(`/api/itam/disposals/${disposal.id}/lifecycle`))
        .status,
    ).toBe(401);
    expect((await get('disposals/missing/lifecycle')).status).toBe(404);
  });
});
