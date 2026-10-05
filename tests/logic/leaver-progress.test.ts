// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { today } from '../../server/providers/itam/dates.js';
import { deviceRoutes } from '../../server/routes/itam/devices.js';
import { masterDataRoutes } from '../../server/routes/itam/master-data.js';
import { workbenchRoutes } from '../../server/routes/itam/workbench.js';
import { createTestApp, json, type TestApp } from '../support/test-app.js';

const manager = { user: 'mia', role: 'manager' as const };

/**
 * A leaver's card on the board carries how far their handover has got:
 * of what was in their name when they left, how much is settled — the
 * count their 归属 tab reads.
 */
describe("a leaver's handover progress", () => {
  let app: TestApp;
  let modelId = '';
  let locationId = '';
  let departmentId = '';

  const post = (
    path: string,
    body: Record<string, unknown> = {},
    who = manager,
  ) => app.request(`/api/itam/${path}`, { ...json(body), ...who });
  const data = async <T>(response: Response): Promise<T> =>
    ((await response.json()) as { data: T }).data;
  const create = async (path: string, body: Record<string, unknown>) => {
    const response = await post(path, body);
    if (response.status !== 201)
      throw new Error(`${path}: ${await response.text()}`);
    return data<{ id: string }>(response);
  };

  beforeEach(async () => {
    app = await createTestApp({ seeds: true });
    for (const routes of [masterDataRoutes, deviceRoutes, workbenchRoutes])
      await app.mount(routes);
    const manufacturer = await create('master/manufacturers', {
      name: 'Test Lenovo',
    });
    const category = await create('master/categories', {
      name: 'Notebook',
      appliesTo: 'device',
    });
    modelId = (
      await create('master/models', {
        name: 'ThinkPad X1',
        categoryId: category.id,
        manufacturerId: manufacturer.id,
      })
    ).id;
    locationId = (
      await create('master/locations', { name: 'HQ', type: 'company' })
    ).id;
    departmentId = (await create('master/departments', { name: 'IT' })).id;
  });

  afterEach(async () => {
    await app.destroy();
  });

  const device = () => create('devices', { modelId, locationId });
  const person = () =>
    create('master/people', { name: 'Zhou Yi', departmentId });

  it("carries a leaver's progress against what they held when they left", async () => {
    const laptop = await device();
    const monitor = await device();
    const leaver = await person();
    for (const held of [laptop, monitor])
      await post(`devices/${held.id}/assign`, {
        targetType: 'person',
        targetId: leaver.id,
      });
    await app.request(`/api/itam/master/people/${leaver.id}`, {
      ...json({ leaveDate: today() }),
      method: 'PATCH',
      ...manager,
    });
    const progressOf = async () =>
      (
        await data<
          {
            key: string;
            records: { id: string; progress?: unknown }[];
          }[]
        >(await app.request('/api/itam/workbench/my-work', manager))
      )
        .find((item) => item.key === 'leaverRecovery')
        ?.records.find((record) => record.id === leaver.id)?.progress;
    // 0 / 2 is the size of the job, before any of it is done.
    expect(await progressOf()).toEqual({ done: 0, total: 2 });
    await post(`devices/${laptop.id}/return`, {});
    expect(await progressOf()).toEqual({ done: 1, total: 2 });
  });
});
