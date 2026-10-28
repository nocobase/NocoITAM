// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { databaseManagerToken } from '@nocobase/db';

import {
  maintenanceServiceToken,
  masterDataServiceToken,
} from '../../server/providers/index.js';
import { addDays, today } from '../../server/providers/itam/dates.js';
import { deviceRoutes } from '../../server/routes/itam/devices.js';
import { entitlementRoutes } from '../../server/routes/itam/entitlements.js';
import { masterDataRoutes } from '../../server/routes/itam/master-data.js';
import { repairRoutes } from '../../server/routes/itam/repairs.js';
import { reportRoutes } from '../../server/routes/itam/reports.js';
import { stockRoutes } from '../../server/routes/itam/stock.js';
import { workbenchRoutes } from '../../server/routes/itam/workbench.js';
import { createTestApp, json, type TestApp } from '../support/test-app.js';

const manager = { user: 'mia', role: 'manager' as const };
const employee = { user: 'li', role: 'employee' as const };

describe('maintenance, reminders, workbench and reports', () => {
  let app: TestApp;
  let modelId = '';
  let categoryId = '';
  let locationId = '';
  let personId = '';
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
  /** They leave: the date is the only input, and the status follows it. */
  const leave = async (id: string, date = '2020-01-31') => {
    const response = await app.request(`/api/itam/master/people/${id}`, {
      ...json({ leaveDate: date }),
      method: 'PATCH',
      ...manager,
    });
    if (response.status !== 200)
      throw new Error(`leave ${id}: ${await response.text()}`);
  };
  const create = async (path: string, body: Record<string, unknown>) => {
    const response = await post(path, body);
    if (response.status !== 201)
      throw new Error(`${path}: ${await response.text()}`);
    return data<{ id: string }>(response);
  };

  beforeEach(async () => {
    app = await createTestApp({ seeds: true });
    for (const routes of [
      masterDataRoutes,
      deviceRoutes,
      stockRoutes,
      workbenchRoutes,
      reportRoutes,
      repairRoutes,
      entitlementRoutes,
    ]) {
      await app.mount(routes);
    }
    const manufacturer = await create('master/manufacturers', {
      name: 'Test Apple',
    });
    const category = await create('master/categories', {
      name: 'Laptop',
      appliesTo: 'device',
      requiresSerial: true,
      depreciationMethod: 'straightLine',
      usefulLifeMonths: 36,
      residualRate: 0.1,
    });
    categoryId = category.id;
    const accessory = await create('master/categories', {
      name: 'Test Mouse',
      appliesTo: 'accessory',
    });
    modelId = (
      await create('master/models', {
        name: 'MacBook Pro 14',
        categoryId: category.id,
        manufacturerId: manufacturer.id,
      })
    ).id;
    locationId = (
      await create('master/locations', { name: 'HQ', type: 'company' })
    ).id;
    const department = await create('master/departments', { name: 'R&D' });
    personId = (
      await create('master/people', {
        name: 'Li Na',
        departmentId: department.id,
        userId: employee.user,
      })
    ).id;
    const accessoryModel = await create('master/models', {
      name: 'MX Keys',
      categoryId: accessory.id,
      manufacturerId: manufacturer.id,
    });
    await create('stock', {
      kind: 'accessory',
      name: 'MX Keys',
      categoryId: accessory.id,
      modelId: accessoryModel.id,
      locationId,
      totalQuantity: 1,
      minimumQuantity: 3,
    });
  });

  afterEach(async () => {
    await app.destroy();
  });

  it('computes reminders, marks due leavers and recomputes depreciation', async () => {
    const warranty = await create('devices', {
      modelId,
      locationId,
      serialNo: 'SN-1',
      warrantyEndDate: new Date(Date.now() + 5 * 86_400_000)
        .toISOString()
        .slice(0, 10),
      purchaseDate: '2024-01-01',
      purchasePrice: 3600,
    });
    // A past return date is refused; the loan is backdated afterwards.
    const pastLoan = await post(`devices/${warranty.id}/loan`, {
      targetType: 'person',
      targetId: personId,
      expectedReturnDate: '2020-01-01',
    });
    expect(pastLoan.status).toBe(400);
    await post(`devices/${warranty.id}/loan`, {
      targetType: 'person',
      targetId: personId,
      expectedReturnDate: '2999-01-01',
    });
    await app.container
      .resolve(databaseManagerToken)
      .query()
      .updateTable('devices')
      .set({ expectedReturnDate: '2020-01-01' })
      .where('id', '=', warranty.id)
      .execute();
    // A leave date that has come marks the person as left; one still ahead
    // leaves them active.
    const hr = await create('master/departments', { name: 'HR' });
    const leaving = await create('master/people', {
      name: 'Zhou Yi',
      departmentId: hr.id,
      leaveDate: '2020-01-31',
    });
    const staying = await create('master/people', {
      name: 'Wu Qing',
      departmentId: hr.id,
      leaveDate: '2999-01-31',
    });
    const maintenance = app.container.resolve(maintenanceServiceToken);
    // Both were settled when they were written — a date already passed makes
    // somebody left on the spot — so the job has nobody to mark tonight. What
    // it is for is a stored date that merely comes round, which is the
    // `markDueLeavers` call below.
    expect((await maintenance.runJob('leavers')).leavers).toBe(0);
    const run = await maintenance.runJob('daily');
    const statusOf = async (id: string) =>
      (
        await data<{ employmentStatus: string; leaveDate: string }>(
          await get(`master/people/${id}`),
        )
      ).employmentStatus;
    expect(await statusOf(leaving.id)).toBe('left');
    expect(await statusOf(staying.id)).toBe('active');
    // Someone already marked is not marked again; the date still ahead is
    // acted on once it comes — one person, not two.
    expect(
      (
        await app.container
          .resolve(masterDataServiceToken)
          .markDueLeavers('2999-12-31')
      ).left,
    ).toBe(1);
    // The job reports what it did; 需要关注 is read live.
    expect(run.reminders).toBeUndefined();
    const reminders = await app.container
      .resolve(maintenanceServiceToken)
      .reminderCounts();
    const count = (kind: string) =>
      reminders.find((entry) => entry.kind === kind)?.count;
    expect(count('warrantyExpiring')).toBe(1);
    expect(count('lowAccessories')).toBe(1);
    expect(count('auditOverdue')).toBe(1);
    // An overdue loan is no longer a reminder — the workbench's
    // 借出逾期 card answers it live, from the same query — but the
    // daily job still tells the device's 负责人, straight from that query
    // and writing no row (2026-09-28) — and only them since 2026-10-05: the
    // borrower is a person in the register, not somebody who signs in.
    expect(count('loanOverdue')).toBeUndefined();
    expect(run.loansOverdue).toBe(1);
    expect(app.notifications.map((n) => n.to.id)).toEqual([manager.user]);
    // An audit 100 days ago satisfies the global 365-day threshold, but not
    // a category whose own cycle is 90 days.
    await app.container
      .resolve(databaseManagerToken)
      .query()
      .updateTable('devices')
      .set({ lastAuditedAt: new Date(Date.now() - 100 * 86_400_000) })
      .where('id', '=', warranty.id)
      .execute();
    const freshlyAudited = await maintenance.reminderCounts();
    expect(
      freshlyAudited.find((entry) => entry.kind === 'auditOverdue')?.count ?? 0,
    ).toBe(0);
    await app.request(`/api/itam/master/categories/${categoryId}`, {
      ...json({ auditCycleDays: 90 }),
      method: 'PATCH',
      ...manager,
    });
    const shortCycle = await maintenance.reminderCounts();
    expect(
      shortCycle.find((entry) => entry.kind === 'auditOverdue')?.count,
    ).toBe(1);

    const counts = await data<{ kind: string; count: number }[]>(
      await get('workbench/reminders'),
    );
    expect(
      counts.find((entry) => entry.kind === 'warrantyExpiring')?.count,
    ).toBe(1);
    const list = await data<{ id: string; data: { deviceNo: string } }[]>(
      await get('workbench/reminders/warrantyExpiring'),
    );
    expect(list[0]?.data.deviceNo).toBe('DE-000001');
    expect((await get('workbench/reminders', employee)).status).toBe(403);

    // Monthly depreciation says how many devices it recomputed; the
    // scheduler plugin keeps the history, so there is no run list here.
    const monthly = await maintenance.runJob('monthly');
    expect(typeof monthly.depreciated).toBe('number');
    expect((await get('workbench/jobs')).status).toBe(404);
  });

  it('counts a component below its water level, and lists it', async () => {
    // A component is kept as a quantity like an accessory, and its page has
    // always offered a water level; the check used to skip its kind, so the
    // value could be set and never heard about (fixed 2026-09-28).
    const componentCategory = await create('master/categories', {
      name: 'SSD',
      appliesTo: 'component',
    });
    const maker = await create('master/manufacturers', {
      name: 'Test Samsung',
    });
    const componentModel = await create('master/models', {
      name: '1TB NVMe',
      categoryId: componentCategory.id,
      manufacturerId: maker.id,
    });
    const spare = await create('stock', {
      kind: 'component',
      name: '1TB NVMe',
      categoryId: componentCategory.id,
      modelId: componentModel.id,
      locationId,
      totalQuantity: 1,
      minimumQuantity: 4,
    });
    const reminders = await app.container
      .resolve(maintenanceServiceToken)
      .reminderCounts();
    // A rule of its own (2026-10-05): the fixture's accessory, below its
    // level too, counts under 低于水位的配件 instead.
    expect(
      reminders.find((entry) => entry.kind === 'lowComponents')?.count,
    ).toBe(1);
    expect(
      reminders.find((entry) => entry.kind === 'lowAccessories')?.count,
    ).toBe(1);

    // And the named view lists it: 低于水位 compares columns, so it cannot
    // be a filter parameter.
    const listed = await data<{ id: string }[]>(
      await get('stock?filter[kind]=component&filter[view]=lowStock'),
    );
    expect(listed.map((row) => row.id)).toEqual([spare.id]);
  });

  it('counts subscriptions paying for idle seats, not perpetual licences', async () => {
    // Both have every seat free, past the idle ratio (2026-10-28).
    const subscription = await create('entitlements', {
      kind: 'subscription',
      softwareProductId: 'sp-microsoft-365',
      name: 'Idle subscription',
      licensingModel: 'perUser',
      billingModel: 'perSeat',
      seatCount: 10,
      billingCycle: 'month',
      unitPrice: 10,
      expiryDate: '2999-01-01',
    });
    await create('entitlements', {
      kind: 'perpetual',
      softwareProductId: 'sp-microsoft-365',
      name: 'Idle licence',
      licensingModel: 'perUser',
      seatCount: 10,
    });
    const reminders = await app.container
      .resolve(maintenanceServiceToken)
      .reminderCounts();
    expect(
      reminders.find((entry) => entry.kind === 'entitlementIdle')?.count,
    ).toBe(1);
    // The rule opens the subscriptions alone.
    const listed = await data<{ id: string }[]>(
      await get('entitlements?filter[view]=idleSubscriptions'),
    );
    expect(listed.map((row) => row.id)).toEqual([subscription.id]);
  });

  it('answers 需要关注 live, without waiting for the daily job', async () => {
    const lowStock = async () =>
      (
        await data<{ kind: string; count: number }[]>(
          await get('workbench/reminders'),
        )
      ).find((entry) => entry.kind === 'lowAccessories')?.count;
    // The fixture's accessory is already below its level.
    expect(await lowStock()).toBe(1);
    const category = await create('master/categories', {
      name: 'Cables',
      appliesTo: 'accessory',
    });
    const maker = await create('master/manufacturers', { name: 'Test Anker' });
    const model = await create('master/models', {
      name: 'USB-C cable',
      categoryId: category.id,
      manufacturerId: maker.id,
    });
    await create('stock', {
      kind: 'accessory',
      name: 'USB-C cable',
      categoryId: category.id,
      modelId: model.id,
      locationId,
      totalQuantity: 1,
      minimumQuantity: 5,
    });
    // Read again at once: nothing recomputed in between, and it counts.
    expect(await lowStock()).toBe(2);
    // And the card can name what it found, with available against minimum.
    const accessories = (
      await data<
        {
          kind: string;
          preview: { label: string; figures?: [number, number] }[];
        }[]
      >(await get('workbench/reminders'))
    ).find((entry) => entry.kind === 'lowAccessories');
    expect(accessories?.preview).toContainEqual(
      expect.objectContaining({ label: 'USB-C cable', figures: [1, 5] }),
    );
  });

  it("lists every overdue loan, saying which are the reader's own", async () => {
    // Taking a device back is granted by permission rather than by owning
    // the record, so scoping the card to 负责人 was a convention — and its
    // cost was that a device lent by somebody on holiday went overdue in
    // one inbox nobody was reading. The 负责人 is still who to ask; the row
    // says so instead of the query.
    const loan = async (ownerId: string, serialNo: string) => {
      const lent = await create('devices', {
        modelId,
        locationId,
        serialNo,
        ownerId,
      });
      await post(`devices/${lent.id}/loan`, {
        targetType: 'person',
        targetId: personId,
        expectedReturnDate: '2999-01-01',
      });
      await app.container
        .resolve(databaseManagerToken)
        .query()
        .updateTable('devices')
        .set({ expectedReturnDate: '2020-01-01' })
        .where('id', '=', lent.id)
        .execute();
      return lent;
    };
    const mine = await loan(manager.user, 'SN-MINE');
    const theirs = await loan('someone-else', 'SN-THEIRS');
    const work = await data<
      {
        key: string;
        count: number;
        records: { id: string; mine?: boolean }[];
      }[]
    >(await get('workbench/my-work'));
    const loans = work.find((item) => item.key === 'loansDueToday');
    expect(loans?.count).toBe(2);
    // The reader's own first, then the longest overdue.
    expect(loans?.records.map((row) => row.id)).toEqual([mine.id, theirs.id]);
    expect(loans?.records.map((row) => row.mine ?? false)).toEqual([
      true,
      false,
    ]);
  });

  it("makes a leaver everybody's to-do, counting the reader's share", async () => {
    // Another IT person: somebody who may carry the recovery out and
    // answers for none of it. Not the double's `support` role, which grants
    // only `read` — and a card whose buttons would all refuse is not a
    // to-do, so each half now asks for its own act.
    const colleague = { user: 'sam', role: 'manager' as const };
    const hr = await create('master/departments', { name: 'HR' });
    // Issued to them while they still worked here: an assignment refuses
    // somebody who has already left, which is the order this happens in.
    const leaver = await create('master/people', {
      name: 'Zhou Yi',
      departmentId: hr.id,
    });
    const device = await create('devices', {
      modelId,
      locationId,
      serialNo: 'SN-LEFT',
      // Mia answers for it and Sam does not — which decides what each row
      // *says*, not who sees it.
      ownerId: manager.user,
    });
    await post(`devices/${device.id}/assign`, {
      targetType: 'person',
      targetId: leaver.id,
    });
    await leave(leaver.id);
    await app.container.resolve(maintenanceServiceToken).runJob('leavers');

    const workOf = async (who: { user: string; role: 'support' | 'manager' }) =>
      data<
        {
          key: string;
          count: number;
          records: { id: string; count?: number }[];
        }[]
      >(await get('workbench/my-work', who));
    const mine = (await workOf(manager)).find(
      (item) => item.key === 'leaverRecovery',
    );
    expect(mine?.count).toBe(1);
    expect(mine?.records.map((row) => row.id)).toEqual([leaver.id]);
    // The row says how many of this leaver's holdings are the reader's, so it
    // is read without being opened — one device here, not the whole of what
    // they hold.
    expect(mine?.records[0]?.count).toBe(1);
    // Somebody who answers for none of it still sees the person — work must
    // not hide in one reader's inbox — and their row says nothing about a
    // share, rather than 0 项.
    const theirs = (await workOf(colleague)).find(
      (item) => item.key === 'leaverRecovery',
    );
    expect(theirs?.records.map((row) => row.id)).toEqual([leaver.id]);
    expect(theirs?.records[0]?.count).toBeUndefined();

    // And it is a to-do rather than a reminder: the same people must not be
    // on one screen as both work and risk.
    const reminders = (await app.container
      .resolve(maintenanceServiceToken)
      .reminderCounts()) as { kind: string }[];
    expect(reminders.map((row) => row.kind)).not.toContain(
      'leftPersonHoldings',
    );
  });

  /**
   * Offboarding's other half. A leaver's own records answer for nothing a
   * holder can hand back, so while the card was scoped to "things whose
   * 负责人 is me" a person who held nothing and owned four records was in
   * nobody's queue at all — and changing the name on a purchase order is
   * its creator's to do, which holding a device never made anybody.
   */
  it('counts a leaver who holds nothing but still has records in their name', async () => {
    const hr = await create('master/departments', { name: 'HR' });
    const owner = await create('master/people', {
      name: 'Zhou Yi',
      departmentId: hr.id,
      // Records are keyed by sign-in, which the person record bridges to.
      userId: 'zhou',
    });
    const quiet = await create('master/people', {
      name: 'Qian Qian',
      departmentId: hr.id,
      userId: 'qian',
    });
    // A joiner they were getting equipped: theirs to hand over.
    await create('master/people', {
      name: 'New Joiner',
      departmentId: hr.id,
      hireDate: addDays(today(), 5),
      onboardingOwnerId: 'zhou',
    });
    await leave(owner.id);
    await leave(quiet.id);

    const work = await data<
      { key: string; records: { id: string; count?: number }[] }[]
    >(await get('workbench/my-work'));
    const leavers = work.find((item) => item.key === 'leaverRecovery');
    // The one with a record to hand over is waiting; the one who left
    // clean is not, so the card does not collect every past leaver.
    expect(leavers?.records.map((row) => row.id)).toEqual([owner.id]);
    // It counts towards the person being unsettled without counting
    // towards anybody's share: handing a record over is a decision, not a
    // thing in somebody's name.
    expect(leavers?.records[0]?.count).toBeUndefined();
  });

  it('derives 在职状态 from the leave date and refuses it as an input', async () => {
    const hr = await create('master/departments', { name: 'HR' });
    const person = await create('master/people', {
      name: 'Zhou Yi',
      departmentId: hr.id,
    });
    const statusOf = async () =>
      (
        await data<{ employmentStatus: string }>(
          await get(`master/people/${person.id}`),
        )
      ).employmentStatus;
    expect(await statusOf()).toBe('active');

    // A date that has come settles it on the spot, not at the next run.
    await app.request(`/api/itam/master/people/${person.id}`, {
      ...json({ leaveDate: '2020-01-31' }),
      method: 'PATCH',
      ...manager,
    });
    expect(await statusOf()).toBe('left');

    // Extending the notice period puts them back, without anything else to undo.
    await app.request(`/api/itam/master/people/${person.id}`, {
      ...json({ leaveDate: '2099-01-31' }),
      method: 'PATCH',
      ...manager,
    });
    expect(await statusOf()).toBe('active');

    // Setting it directly is refused rather than ignored, so a caller is told
    // the field is not theirs instead of watching the value not stick.
    const direct = await app.request(`/api/itam/master/people/${person.id}`, {
      ...json({ employmentStatus: 'left' }),
      method: 'PATCH',
      ...manager,
    });
    expect(direct.status).toBe(400);
    expect(await statusOf()).toBe('active');
  });

  /**
   * The live list cannot say how much of a recovery is done, because what is
   * settled has left it. The snapshot taken as somebody is marked left is
   * the denominator, and what it holds that nobody holds now is the part
   * that is finished — listed, not merely counted, so the reader sees which.
   */
  it('keeps what a leaver had, so a settled item still reads', async () => {
    const hr = await create('master/departments', { name: 'HR' });
    const leaver = await create('master/people', {
      name: 'Zhou Yi',
      departmentId: hr.id,
    });
    const device = await create('devices', {
      modelId,
      locationId,
      serialNo: 'SN-SNAP',
      ownerId: manager.user,
    });
    await post(`devices/${device.id}/assign`, {
      targetType: 'person',
      targetId: leaver.id,
    });
    await leave(leaver.id);

    const recovery = async () =>
      data<{
        items: { id: string }[];
        settled: { id: string; label: string }[];
      }>(await get(`master/people/${leaver.id}/recovery`));
    const before = await recovery();
    expect(before.items.map((item) => item.id)).toEqual([device.id]);
    expect(before.settled).toEqual([]);

    await post(`devices/${device.id}/return`, { nextStatus: 'inStock' });
    const after = await recovery();
    // Gone from what is left, still in what the recovery was.
    expect(after.items).toEqual([]);
    expect(after.settled.map((item) => item.id)).toEqual([device.id]);
  });

  it('prepares a leaver recovery once and hands it to the owner', async () => {
    const hr = await create('master/departments', { name: 'HR' });
    // Issued to them while they still worked here: an assignment refuses
    // somebody who has already left, which is the order this happens in.
    const leaver = await create('master/people', {
      name: 'Zhou Yi',
      departmentId: hr.id,
    });
    const device = await create('devices', {
      modelId,
      locationId,
      serialNo: 'SN-PREP',
      ownerId: manager.user,
    });
    await post(`devices/${device.id}/assign`, {
      targetType: 'person',
      targetId: leaver.id,
    });
    await leave(leaver.id);
    const maintenance = app.container.resolve(maintenanceServiceToken);
    const first = await maintenance.runJob('leavers');
    expect(first.recoveriesPrepared).toBe(1);

    const events = await app.container
      .resolve(databaseManagerToken)
      .query()
      .selectFrom('historyEvents')
      .select(['type', 'payload', 'origin'])
      .where('subjectType', '=', 'people')
      .where('subjectId', '=', leaver.id)
      .where('type', '=', 'recoveryPrepared')
      .execute<{ type: string; payload: unknown; origin: string | null }>();
    expect(events).toHaveLength(1);
    expect(events[0]?.origin).toBe('schedule');

    // The owner is told their own part, and only theirs.
    expect(app.notifications.some((n) => n.to.id === manager.user)).toBe(true);

    // A second night does not prepare it again, because the event is both the
    // preparation and the record that it was made.
    expect((await maintenance.runJob('leavers')).recoveriesPrepared).toBe(0);
  });

  it('answers "my work" by role and builds the reports', async () => {
    const device = await create('devices', {
      modelId,
      locationId,
      serialNo: 'SN-2',
      purchaseDate: '2025-01-15',
      purchasePrice: 2400,
    });
    await post(`devices/${device.id}/assign`, {
      targetType: 'person',
      targetId: personId,
    });
    await create('repairs', {
      deviceId: device.id,
      method: 'internal',
      faultDescription: 'The E key sticks',
      faultCategory: 'keyboard',
      expectedReturnAt: '2030-01-01',
    });
    const itWork = await data<{ key: string; count: number }[]>(
      await get('workbench/my-work'),
    );
    expect(itWork.map((item) => item.key)).toContain('loansDueToday');
    const employeeWork = await data<{ key: string; count: number }[]>(
      await get('workbench/my-work', employee),
    );
    expect(employeeWork).toEqual([]);

    const overview = await data<{
      totals: Record<string, number | null>;
      sections: { key: string; rows: Record<string, unknown>[] }[];
    }>(await get('reports/overview?from=2025-01-01&to=2025-12-31'));
    expect(overview.totals.devices).toBe(1);
    // The repair took the only device out of use.
    expect(overview.totals.utilization).toBe(0);
    expect(overview.totals.purchaseSpend).toBe(2400);
    expect(
      overview.sections
        .find((section) => section.key === 'byStatus')
        ?.rows.find((row) => row.status === 'inRepair')?.count,
    ).toBe(1);

    const repairReport = await data<{ totals: Record<string, number> }>(
      await get('reports/repairs'),
    );
    expect(repairReport.totals.repairs).toBe(1);
    const perPerson = await data<{
      sections: { key: string; rows: Record<string, unknown>[] }[];
    }>(await get('reports/perPersonCost'));
    const li = perPerson.sections
      .find((section) => section.key === 'byPerson')
      ?.rows.find((row) => row.name === 'Li Na');
    expect(li?.devices).toBe(1);
    expect(li?.annualDepreciation).toBe(720);

    expect((await get('reports/unknown')).status).toBe(400);
    expect((await get('reports/ledger', employee)).status).toBe(403);
    const csv = await get('reports/ledger?format=csv');
    expect(csv.status).toBe(200);
    expect(csv.headers.get('content-type')).toContain('text/csv');
    expect(await csv.text()).toContain('DE-000001');
  });
});
