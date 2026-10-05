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
 * the 待入职 to-do it feeds.
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
    }>(
      await app.request(`/api/itam/master/people/${id}/onboarding`, manager),
    );

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
      plan(joiner.id).then(
        (current) =>
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
    expect(line.prepared[0]).toMatchObject({ id: laptop.id, state: 'reserved' });
    expect(line.proposals).toEqual([]);
    expect((await plan(joiner.id)).prepared).toBe(before.prepared + 1);
  });

  it('lists a joiner as 待入职 for the team until their kit is in hand', async () => {
    const joiner = await person('Lin Xue', 'dept-product', 'Designer');
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
    expect(all?.records.map((record) => record.id)).toEqual([joiner.id]);
    expect(all?.records[0]?.progress).toEqual({
      done: 0,
      total: (await plan(joiner.id)).required,
    });
    // Nobody owns a joiner's preparation: under 我负责的 it is empty.
    expect((await card('mine'))?.count).toBe(0);
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
