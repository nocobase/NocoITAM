// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { databaseManagerToken } from '@nocobase/db';

import {
  maintenanceServiceToken,
  masterDataServiceToken,
} from '../../server/providers/index.js';
import { deviceRoutes } from '../../server/routes/itam/devices.js';
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
    expect((await maintenance.runJob('leavers')).leavers).toBe(1);
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
      await app.container
        .resolve(masterDataServiceToken)
        .markDueLeavers('2999-12-31'),
    ).toBe(1);
    const reminders = run.reminders as {
      kind: string;
      count: number;
    }[];
    const count = (kind: string) =>
      reminders.find((entry) => entry.kind === kind)?.count;
    expect(count('warrantyExpiring')).toBe(1);
    expect(count('lowStock')).toBe(1);
    expect(count('auditOverdue')).toBe(1);
    // An overdue loan is no longer a reminder — the workbench's
    // 设备借出逾期未还 card answers it live, from the same query — but the
    // daily job still tells the borrower and the device's 负责人, straight
    // from that query and writing no row (2026-09-28).
    expect(count('loanOverdue')).toBeUndefined();
    expect(run.loansOverdue).toBe(1);
    expect(app.notifications.map((n) => n.to.id).sort()).toEqual(
      [employee.user, manager.user].sort(),
    );
    // An audit 100 days ago satisfies the global 365-day threshold, but not
    // a category whose own cycle is 90 days.
    await app.container
      .resolve(databaseManagerToken)
      .query()
      .updateTable('devices')
      .set({ lastAuditedAt: new Date(Date.now() - 100 * 86_400_000) })
      .where('id', '=', warranty.id)
      .execute();
    const freshlyAudited = await maintenance.computeReminders();
    expect(
      freshlyAudited.find((entry) => entry.kind === 'auditOverdue')?.count ?? 0,
    ).toBe(0);
    await app.request(`/api/itam/master/categories/${categoryId}`, {
      ...json({ auditCycleDays: 90 }),
      method: 'PATCH',
      ...manager,
    });
    const shortCycle = await maintenance.computeReminders();
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
    const maker = await create('master/manufacturers', { name: 'Test Samsung' });
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
      .computeReminders();
    // The accessory the fixture stocks is below its level too.
    expect(reminders.find((entry) => entry.kind === 'lowStock')?.count).toBe(2);

    // And the named view lists it: 低于水位 compares columns, so it cannot
    // be a filter parameter.
    const listed = await data<{ id: string }[]>(
      await get('stock?filter[kind]=component&filter[view]=lowStock'),
    );
    expect(listed.map((row) => row.id)).toEqual([spare.id]);
  });

  it('counts only the overdue loans on devices this reader is responsible for', async () => {
    // 我的待办 is what is on *my* plate: chasing a device back belongs to
    // its 负责人, the way finishing a repair belongs to that repair's.
    const loan = async (ownerId: string, serialNo: string) => {
      const lent = await create('devices', { modelId, locationId, serialNo, ownerId });
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
    await loan('someone-else', 'SN-THEIRS');
    const work = await data<
      { key: string; count: number; records: { id: string }[] }[]
    >(await get('workbench/my-work'));
    const loans = work.find((item) => item.key === 'loansDueToday');
    expect(loans?.count).toBe(1);
    expect(loans?.records.map((row) => row.id)).toEqual([mine.id]);
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
