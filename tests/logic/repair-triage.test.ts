// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { aiRoutes } from '../../server/routes/itam/ai.js';
import { deviceRoutes } from '../../server/routes/itam/devices.js';
import { masterDataRoutes } from '../../server/routes/itam/master-data.js';
import { repairRoutes } from '../../server/routes/itam/repairs.js';
import { createTestApp, json, type TestApp } from '../support/test-app.js';

// The model a reading asks: what it was asked is kept, and its answer is the
// test's. There is no Agents plugin in the test harness.
const model = vi.hoisted(() => ({ asked: [] as string[] }));
vi.mock('../../server/providers/itam/ai-model.js', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../server/providers/itam/ai-model.js')
  >()),
  openSession: async () => ({
    model: { modelService: 'test', model: 'reader' },
    ask: async () => '',
    askJson: async (content: string) => {
      model.asked.push(content);
      return {
        reading: {
          faultCategory: 'screen',
          recommendation: 'replace',
          reasons: ['Out of warranty since 2024'],
        },
        said: 'Ask whether the screen was dropped.',
      };
    },
  }),
  readSkill: async () => '',
}));

const manager = { user: 'mia', role: 'manager' as const };
const employee = { user: 'li', role: 'employee' as const };

/**
 * 维修单整理 (2026-10-17): a repair is filed under a kind of fault, and
 * Noco, asked from the new repair form, reads the device as the person —
 * its warranty, age, repairs and how its model has fared — to fill the kind
 * and say whether to repair it at all.
 */
describe('repair triage', () => {
  let app: TestApp;
  let deviceId: string;
  let vendorId: string;
  const post = (
    path: string,
    body: Record<string, unknown>,
    who: typeof manager | typeof employee = manager,
  ) => app.request(`/api/itam/${path}`, { ...json(body), ...who });
  const data = async <T>(response: Response): Promise<T> =>
    ((await response.json()) as { data: T }).data;
  const created = async (path: string, body: Record<string, unknown>) => {
    const response = await post(path, body);
    if (response.status !== 201)
      throw new Error(`${path}: ${await response.text()}`);
    return (await data<{ id: string }>(response)).id;
  };
  const repair = (body: Record<string, unknown> = {}) =>
    post('repairs', {
      deviceId,
      method: 'sendOut',
      vendorId,
      faultDescription: 'The screen flickers',
      expectedReturnAt: '2026-12-01',
      ...body,
    });
  const read = (
    context: Record<string, unknown>,
    who: typeof manager | typeof employee = manager,
  ) =>
    post(
      'ai/read',
      {
        task: 'repairTriage',
        material: 'Screen flickers and goes black',
        context,
        language: 'en-US',
      },
      who,
    );

  beforeEach(async () => {
    model.asked = [];
    app = await createTestApp({ seeds: true });
    for (const routes of [
      masterDataRoutes,
      deviceRoutes,
      repairRoutes,
      aiRoutes,
    ])
      await app.mount(routes);
    const manufacturerId = await created('master/manufacturers', {
      name: 'Test Dell',
    });
    const categoryId = await created('master/categories', {
      name: 'Laptop',
      appliesTo: 'device',
    });
    const modelId = await created('master/models', {
      name: 'Latitude 5480',
      categoryId,
      manufacturerId,
    });
    const locationId = await created('master/locations', {
      name: 'HQ',
      type: 'company',
    });
    vendorId = await created('master/vendors', {
      name: 'Repair shop',
      types: ['repairProvider'],
    });
    deviceId = await created('devices', {
      modelId,
      locationId,
      purchaseDate: '2018-05-20',
      warrantyEndDate: '2021-05-20',
    });
  });

  afterEach(async () => {
    await app.destroy();
  });

  it('files a repair under a kind of fault, and refuses one it does not know', async () => {
    const filed = await repair({ faultCategory: 'screen' });
    expect(filed.status).toBe(201);
    expect(await data(filed)).toMatchObject({ faultCategory: 'screen' });
    expect((await repair({ faultCategory: 'toaster' })).status).toBe(400);
  });

  it('reads the device as the person, with its repairs and its model’s', async () => {
    const first = await data<{ id: string }>(
      await repair({ faultCategory: 'screen' }),
    );
    expect(
      (
        await post(`repairs/${first.id}/complete`, {
          result: 'repaired',
          disposition: 'return',
        })
      ).status,
    ).toBe(200);

    const answer = await read({ deviceId });
    expect(answer.status).toBe(200);
    expect(await data(answer)).toMatchObject({
      reading: { faultCategory: 'screen', recommendation: 'replace' },
      said: 'Ask whether the screen was dropped.',
    });
    const asked = model.asked.at(-1) ?? '';
    const context = JSON.parse(
      /<context>\n(.*)\n<\/context>/s.exec(asked)?.[1] ?? '{}',
    ) as { device: Record<string, unknown> };
    expect(context.device).toMatchObject({
      modelName: 'Latitude 5480',
      purchaseDate: '2018-05-20',
      warrantyEndDate: '2021-05-20',
      repairCount: 1,
      sameModel: {
        devicesInUse: 1,
        repairsLastYear: 1,
        byFaultCategory: { screen: 1 },
      },
    });
    expect(asked).toContain('Screen flickers and goes black');
  });

  it('asks for the device first, and is only for whoever may file a repair', async () => {
    expect((await read({})).status).toBe(422);
    expect((await read({ deviceId }, employee)).status).toBe(403);
  });
});
