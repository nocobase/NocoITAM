// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { aiRoutes } from '../../server/routes/itam/ai.js';
import { attachmentLinkRoutes } from '../../server/routes/itam/attachments.js';
import { deviceRoutes } from '../../server/routes/itam/devices.js';
import { disposalRoutes } from '../../server/routes/itam/disposals.js';
import { masterDataRoutes } from '../../server/routes/itam/master-data.js';
import { repairRoutes } from '../../server/routes/itam/repairs.js';
import { createTestApp, json, type TestApp } from '../support/test-app.js';

// The model a reading asks: what it was asked is kept, and its answer is the
// test's, by the task it was asked.
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
      if (content.includes('quote for the repair'))
        return {
          reading: {
            amount: 2400,
            currency: 'CNY',
            work: 'Replace the mainboard',
            recommendation: 'replace',
            reasons: ['The quote is above the book value.'],
          },
          said: 'Ask whether a used board is available.',
        };
      return content.includes('repair vendor')
        ? {
            reading: {
              result: 'repaired',
              cost: 480,
              currency: 'CNY',
              notes: 'Keyboard replaced; 90-day warranty on the part.',
              serialNo: 'SN-OTHER',
              uncertain: ['cost'],
            },
            said: 'Check the amount includes tax.',
          }
        : {
            reading: {
              recipientName: 'green recycling',
              disposedAt: '2026-10-20',
              dataWipe: 'wiped',
              wipeMethod: 'physicalDestruction',
              serialNos: ['sn 0002', 'SN-9999'],
            },
            said: 'One serial is not on the disposal.',
          };
    },
  }),
  readSkill: async () => '',
}));

const manager = { user: 'mia', role: 'manager' as const };
const employee = { user: 'li', role: 'employee' as const };

/**
 * 读维修单 and 读处置证明 (2026-10-23): a document read into a repair's
 * completion or a disposal's execution, checked against the register — the
 * serial numbers it prints, and the recipient it names.
 */
describe('document reading', () => {
  let app: TestApp;
  let repairId = '';
  let disposalId = '';
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
    task: string,
    context: Record<string, unknown>,
    who: typeof manager | typeof employee = manager,
  ) =>
    post(
      'ai/read',
      { task, material: 'The document', context, language: 'en-US' },
      who,
    );
  const askedContext = () =>
    JSON.parse(
      /<context>\n(.*)\n<\/context>/s.exec(model.asked.at(-1) ?? '')?.[1] ??
        '{}',
    ) as Record<string, unknown>;

  beforeEach(async () => {
    model.asked = [];
    app = await createTestApp({ seeds: true });
    for (const routes of [
      masterDataRoutes,
      deviceRoutes,
      repairRoutes,
      disposalRoutes,
      attachmentLinkRoutes,
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
    await created('master/vendors', {
      name: 'Green Recycling',
      types: ['recycler'],
    });
    const device = (serialNo: string) =>
      created('devices', { modelId, locationId, serialNo });
    const first = await device('SN-0001');
    const second = await device('SN-0002');
    const third = await device('SN-0003');
    repairId = await created('repairs', {
      deviceId: first,
      method: 'internal',
      expectedReturnAt: '2030-01-01',
      faultDescription: 'Keys stick',
      faultCategory: 'keyboard',
    });
    disposalId = await created('disposals', {
      recipientName: 'To be decided',
      method: 'scrap',
      reason: 'damaged',
      description: 'Broken',
      deviceIds: [second, third],
      dataWipe: 'notWiped',
    });
  });

  afterEach(async () => {
    await app.destroy();
  });

  it('reads a repair report with the repair and its device, and checks the serial', async () => {
    const answer = await read('repairReport', { repairId });
    expect(answer.status).toBe(200);
    expect(await data(answer)).toMatchObject({
      reading: {
        result: 'repaired',
        cost: 480,
        deviceSerialNo: 'SN-0001',
        serialMatches: false,
      },
    });
    const context = askedContext();
    expect(context.repair).toMatchObject({ fault: 'Keys stick' });
    expect(context.device).toMatchObject({
      serialNo: 'SN-0001',
      modelName: 'Latitude 5480',
    });
  });

  it('checks a certificate against the disposal: what it leaves out and adds', async () => {
    const answer = await read('disposalCertificate', { disposalId });
    expect(answer.status).toBe(200);
    const { reading } = await data<{ reading: Record<string, unknown> }>(
      answer,
    );
    // 'sn 0002' is SN-0002 printed another way; SN-0003 is left out,
    // SN-9999 is not on the disposal, and the recipient is a vendor.
    expect(reading.missing).toEqual([
      expect.objectContaining({ serialNo: 'SN-0003' }),
    ]);
    expect(reading.extra).toEqual(['SN-9999']);
    expect(reading.recipientVendorId).toEqual(expect.any(String));
    expect(askedContext().devices).toHaveLength(2);
  });

  it('weighs a quote against the device, and keeps it on the repair', async () => {
    const answer = await read('repairQuote', { repairId });
    expect(answer.status).toBe(200);
    expect(await data(answer)).toMatchObject({
      reading: { amount: 2400, recommendation: 'replace' },
    });
    expect(askedContext().device).toMatchObject({ serialNo: 'SN-0001' });
    const saved = await app.request(`/api/itam/repairs/${repairId}`, {
      ...json({
        quoteAmount: 2400,
        quoteNotes: 'Replace the mainboard',
        quotedAt: '2026-10-23',
        quoteRecommendation: 'replace',
        quoteReasons: 'The quote is above the book value.',
        quoteDecision: null,
      }),
      method: 'PATCH',
      ...manager,
    });
    expect(saved.status).toBe(200);
    const repair = await data<Record<string, unknown>>(
      await app.request(`/api/itam/repairs/${repairId}`, manager),
    );
    // A decimal reads back as text, as a repair's cost does.
    expect(Number(repair.quoteAmount)).toBe(2400);
    expect(repair).toMatchObject({
      quoteRecommendation: 'replace',
      quoteDecision: null,
    });
    const decided = await app.request(`/api/itam/repairs/${repairId}`, {
      ...json({ quoteDecision: 'maybe' }),
      method: 'PATCH',
      ...manager,
    });
    expect(decided.status).toBe(400);
  });

  it('is only for whoever may complete or carry out the record', async () => {
    expect((await read('repairReport', { repairId }, employee)).status).toBe(
      403,
    );
    expect(
      (await read('disposalCertificate', { disposalId }, employee)).status,
    ).toBe(403);
    expect((await read('repairQuote', { repairId }, employee)).status).toBe(
      403,
    );
    expect((await read('repairReport', { repairId: 'nope' })).status).toBe(404);
  });

  it('reads the text of a file only when it is attached to the record', async () => {
    const response = await post(
      `attachments/repairs/${repairId}/document-text`,
      {
        fileId: 'not-attached',
      },
    );
    expect(response.status).toBe(404);
  });
});
