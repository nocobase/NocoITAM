// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { aiRoutes } from '../../server/routes/itam/ai.js';
import { deviceRoutes } from '../../server/routes/itam/devices.js';
import { masterDataRoutes } from '../../server/routes/itam/master-data.js';
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
          reason: 'endOfLife',
          method: 'scrap',
          dataWipe: 'notWiped',
          advice: 'reconsider',
          concerns: [{ deviceNo: 'DE-000002', note: 'Leased' }],
        },
        said: 'Return the leased one to its lessor instead.',
      };
    },
  }),
  readSkill: async () => '',
}));

const manager = { user: 'mia', role: 'manager' as const };
const employee = { user: 'li', role: 'employee' as const };

/**
 * 报废诊断 (2026-10-20): asked from the new disposal form, Asset Steward
 * reads each device as the person — whose it is, who holds it, its warranty
 * and age — to fill the reason, method and data wipe, and to say which
 * should not be disposed of yet.
 */
describe('disposal triage', () => {
  let app: TestApp;
  const deviceIds: string[] = [];
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
  const read = (
    context: Record<string, unknown>,
    who: typeof manager | typeof employee = manager,
  ) =>
    post(
      'ai/read',
      {
        task: 'disposalTriage',
        material: 'Old laptops, no longer used',
        context,
        language: 'en-US',
      },
      who,
    );

  beforeEach(async () => {
    model.asked = [];
    deviceIds.length = 0;
    app = await createTestApp({ seeds: true });
    for (const routes of [masterDataRoutes, deviceRoutes, aiRoutes])
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
    const lenderId = await created('master/vendors', {
      name: 'Leasing company',
      types: ['lessor'],
    });
    deviceIds.push(
      await created('devices', {
        modelId,
        locationId,
        purchaseDate: '2018-05-20',
        warrantyEndDate: '2021-05-20',
      }),
      await created('devices', {
        modelId,
        locationId,
        ownership: 'leased',
        lenderVendorId: lenderId,
        returnDueDate: '2028-01-10',
        purchaseDate: '2025-01-10',
        warrantyEndDate: '2099-01-10',
      }),
    );
  });

  afterEach(async () => {
    await app.destroy();
  });

  it('reads every device as the person, whose it is and its warranty', async () => {
    const answer = await read({ deviceIds });
    expect(answer.status).toBe(200);
    expect(await data(answer)).toMatchObject({
      reading: { reason: 'endOfLife', method: 'scrap', advice: 'reconsider' },
      said: 'Return the leased one to its lessor instead.',
    });
    const asked = model.asked.at(-1) ?? '';
    const context = JSON.parse(
      /<context>\n(.*)\n<\/context>/s.exec(asked)?.[1] ?? '{}',
    ) as { devices: Record<string, unknown>[] };
    expect(context.devices).toEqual([
      expect.objectContaining({
        modelName: 'Latitude 5480',
        ownership: 'owned',
        underWarranty: false,
      }),
      expect.objectContaining({ ownership: 'leased', underWarranty: true }),
    ]);
    expect(asked).toContain('Old laptops, no longer used');
  });

  it('asks for the devices first, and is only for whoever may request a disposal', async () => {
    expect((await read({ deviceIds: [] })).status).toBe(422);
    expect((await read({ deviceIds }, employee)).status).toBe(403);
  });
});
