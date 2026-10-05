// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { databaseManagerToken } from '@nocobase/db';

import { addDays, today } from '../../server/providers/itam/dates.js';
import { handoverCompletionToken } from '../../server/providers/itam/handover-completion.js';
import { deviceRoutes } from '../../server/routes/itam/devices.js';
import { masterDataRoutes } from '../../server/routes/itam/master-data.js';
import { repairRoutes } from '../../server/routes/itam/repairs.js';
import { workbenchRoutes } from '../../server/routes/itam/workbench.js';
import { createTestApp, json, type TestApp } from '../support/test-app.js';

const manager = { user: 'mia', role: 'manager' as const };
const colleague = { user: 'ann', role: 'manager' as const };

/**
 * 已完成: what the reader finished lately stays in 我的待办 instead of
 * vanishing the moment it is done. Each to-do's own act is read back from
 * the history it wrote, so it is the reader's acts that count — and a
 * leaver counts once nothing of theirs is unsettled, by the rule their
 * card reads, inverted.
 */
describe('finished to-dos', () => {
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
  const doneOf = async (who = manager, scope?: 'mine') =>
    data<{ key: string; id: string; title: string; doneAt: string }[]>(
      await app.request(
        `/api/itam/workbench/my-work/done${scope ? `?scope=${scope}` : ''}`,
        who,
      ),
    );

  beforeEach(async () => {
    app = await createTestApp({ seeds: true });
    for (const routes of [
      masterDataRoutes,
      deviceRoutes,
      repairRoutes,
      workbenchRoutes,
    ])
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

  it("lists the team's finished repairs, and the reader's own under mine", async () => {
    const mine = await create('repairs', {
      deviceId: (await device()).id,
      method: 'internal',
      expectedReturnAt: '2030-01-01',
      faultDescription: 'Fan rattles',
    });
    await post(`repairs/${mine.id}/complete`, { result: 'repaired' });
    const theirs = await create('repairs', {
      deviceId: (await device()).id,
      method: 'internal',
      expectedReturnAt: '2030-01-01',
      faultDescription: 'Hinge loose',
    });
    await post(
      `repairs/${theirs.id}/complete`,
      { result: 'repaired' },
      colleague,
    );

    // The team's by default, like the queue: both repairs.
    expect((await doneOf()).map((row) => row.id).sort()).toEqual(
      [mine.id, theirs.id].sort(),
    );
    // Under mine, only the reader's own act.
    const done = await doneOf(manager, 'mine');
    expect(done.map((row) => [row.key, row.id])).toEqual([
      ['activeRepairs', mine.id],
    ]);
    // Named the way its own row names it.
    expect(done[0]?.title).toMatch(/^RP-/);
  });

  it('counts a loan the reader brought back', async () => {
    const lent = await device();
    const borrower = await person();
    await post(`devices/${lent.id}/loan`, {
      targetType: 'person',
      targetId: borrower.id,
      expectedReturnDate: '2030-01-01',
    });
    await post(`devices/${lent.id}/return`, {});
    expect((await doneOf()).map((row) => [row.key, row.id])).toEqual([
      ['loansDueToday', lent.id],
    ]);
  });

  it('lists a leaver once nothing of theirs is unsettled, for the team', async () => {
    const held = await device();
    const leaver = await person();
    await post(`devices/${held.id}/assign`, {
      targetType: 'person',
      targetId: leaver.id,
    });
    await app.request(`/api/itam/master/people/${leaver.id}`, {
      ...json({ leaveDate: today() }),
      method: 'PATCH',
      ...manager,
    });
    // Still holding the laptop: waiting, not done.
    expect((await doneOf()).some((row) => row.key === 'leaverRecovery')).toBe(
      false,
    );

    await post(`devices/${held.id}/return`, {});
    const done = await doneOf(colleague);
    // The team's, as the card is — the colleague did none of it.
    expect(done.find((row) => row.key === 'leaverRecovery')).toMatchObject({
      id: leaver.id,
      title: 'Zhou Yi',
      doneAt: today(),
    });
    // Not under mine: once settled, nothing records whose share it was.
    expect(
      (await doneOf(manager, 'mine')).some(
        (row) => row.key === 'leaverRecovery',
      ),
    ).toBe(false);
  });

  it('dates a leaver by when their handover was finished, not when they left', async () => {
    const held = await device();
    const leaver = await person();
    await post(`devices/${held.id}/assign`, {
      targetType: 'person',
      targetId: leaver.id,
    });
    // Left 40 days ago, outside the 30-day window by their leave date.
    await app.request(`/api/itam/master/people/${leaver.id}`, {
      ...json({ leaveDate: addDays(today(), -40) }),
      method: 'PATCH',
      ...manager,
    });
    const completion = app.container.resolve(handoverCompletionToken);
    // Nothing to record while the laptop is still out.
    await completion.check('mia');
    await post(`devices/${held.id}/return`, {});
    // What the change signal runs after the return.
    await completion.check('mia');
    // Run again, it records nothing twice.
    await completion.check('mia');

    const done = (await doneOf()).filter((row) => row.key === 'leaverRecovery');
    expect(done).toHaveLength(1);
    expect(done[0]?.doneAt.slice(0, 10)).toBe(today());
    const completed = await app.container
      .resolve(databaseManagerToken)
      .query()
      .selectFrom('historyEvents')
      .select(['actorId'])
      .where('subjectType', '=', 'people')
      .where('subjectId', '=', leaver.id)
      .where('type', '=', 'handoverCompleted')
      .execute<{ actorId: string | null }>();
    // Once, and by whoever settled the last item.
    expect(completed).toEqual([{ actorId: 'mia' }]);
  });

  it('keeps the leave date for a handover finished before anything watched', async () => {
    const held = await device();
    const leaver = await person();
    await post(`devices/${held.id}/assign`, {
      targetType: 'person',
      targetId: leaver.id,
    });
    const left = addDays(today(), -10);
    await app.request(`/api/itam/master/people/${leaver.id}`, {
      ...json({ leaveDate: left }),
      method: 'PATCH',
      ...manager,
    });
    await post(`devices/${held.id}/return`, {});
    const completion = app.container.resolve(handoverCompletionToken);
    // The start-up pass finds it settled already, at a moment nobody knows.
    await completion.check(undefined, { late: true });
    // Nor does the next write claim the moment for itself.
    await completion.check('mia');
    expect(
      (await doneOf()).find((row) => row.key === 'leaverRecovery')?.doneAt,
    ).toBe(left);
  });

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
