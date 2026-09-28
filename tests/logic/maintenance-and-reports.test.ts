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
    expect(count('loanOverdue')).toBe(1);
    expect(count('lowStock')).toBe(1);
    expect(count('auditOverdue')).toBe(1);
    // The overdue loan notifies the borrower and the owner (the actor is nobody).
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
    expect(counts.find((entry) => entry.kind === 'loanOverdue')?.count).toBe(1);
    const list = await data<{ id: string; data: { deviceNo: string } }[]>(
      await get('workbench/reminders/loanOverdue'),
    );
    expect(list[0]?.data.deviceNo).toBe('DE-000001');
    expect((await get('workbench/reminders', employee)).status).toBe(403);

    // Returning the device resolves it.
    await post(`devices/${warranty.id}/return`, {});
    const recomputed = await maintenance.computeReminders();
    expect(
      recomputed.find((entry) => entry.kind === 'loanOverdue')?.count,
    ).toBe(0);

    // Monthly depreciation says how many devices it recomputed; the
    // scheduler plugin keeps the history, so there is no run list here.
    const monthly = await maintenance.runJob('monthly');
    expect(typeof monthly.depreciated).toBe('number');
    expect((await get('workbench/jobs')).status).toBe(404);
  });

  it('finds the two cross-record patterns and lets them resolve', async () => {
    // Neither is a limit one record passed: the subject is a batch or a
    // vendor, and what makes it a finding is a shape across several records.
    const maintenance = app.container.resolve(maintenanceServiceToken);
    const vendor = await create('master/vendors', {
      name: 'Slow Supplies',
      types: ['repairProvider'],
    });
    const batch = await Promise.all(
      [1, 2, 3].map((index) =>
        create('devices', {
          modelId,
          locationId,
          serialNo: `BATCH-${index}`,
          purchaseDate: '2026-01-15',
        }),
      ),
    );
    const countOf = async (kind: string) => {
      const rows = (await maintenance.computeReminders()) as {
        kind: string;
        count: number;
      }[];
      return rows.find((row) => row.kind === kind)?.count ?? 0;
    };

    // Two of the batch under repair is not yet a pattern; the third is.
    for (const device of batch.slice(0, 2))
      await post('repairs', {
        deviceId: device.id,
        method: 'vendorWarranty',
        vendorId: vendor.id,
        faultDescription: 'Screen flickers',
        expectedReturnAt: '2030-01-01',
      });
    expect(await countOf('batchDefect')).toBe(0);
    await post('repairs', {
      deviceId: batch[2]!.id,
      method: 'vendorWarranty',
      vendorId: vendor.id,
      faultDescription: 'Screen flickers',
      expectedReturnAt: '2030-01-01',
    });
    expect(await countOf('batchDefect')).toBe(1);

    // A device bought in another month is not of that batch, so a fourth
    // repair does not make a second finding.
    const other = await create('devices', {
      modelId,
      locationId,
      serialNo: 'BATCH-OTHER',
      purchaseDate: '2025-06-02',
    });
    await post('repairs', {
      deviceId: other.id,
      method: 'vendorWarranty',
      vendorId: vendor.id,
      faultDescription: 'Screen flickers',
      expectedReturnAt: '2030-01-01',
    });
    expect(await countOf('batchDefect')).toBe(1);

    // The vendor rule reads the promised date against the arrival date, so
    // the orders are written straight in: going through the whole request →
    // approval → order → receive路径 would only stamp today's dates, which
    // the rule then has to be told to ignore.
    const query = app.container.resolve(databaseManagerToken).query();
    const order = async (no: string, expected: string, received: string) => {
      const now = new Date().toISOString().replace('Z', '').slice(0, 23);
      await query
        .insertInto('purchaseOrders')
        .values({
          id: `po-${no}`,
          orderNo: no,
          reason: 'newHire',
          requesterId: manager.user,
          vendorId: vendor.id,
          status: 'completed',
          expectedAt: expected,
          receivedAt: received,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    };
    // Two orders a fortnight late is not yet a pattern; the third is.
    await order('PO-A', '2026-01-10', '2026-01-24');
    await order('PO-B', '2026-02-10', '2026-02-24');
    expect(await countOf('vendorLateDeliveries')).toBe(0);
    await order('PO-C', '2026-03-10', '2026-03-24');
    expect(await countOf('vendorLateDeliveries')).toBe(1);
    // And it resolves itself: the vendor is judged on its recent orders
    // together, so the next one arriving on time clears the finding.
    await order('PO-D', '2026-04-10', '2026-04-11');
    expect(await countOf('vendorLateDeliveries')).toBe(0);
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
