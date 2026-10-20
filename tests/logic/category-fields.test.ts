// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { aiRoutes } from '../../server/routes/itam/ai.js';
import { masterDataRoutes } from '../../server/routes/itam/master-data.js';
import { createTestApp, json, type TestApp } from '../support/test-app.js';

// What the model was asked, and its answer: two fields for a printer.
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
          fields: [
            { key: 'macAddress', label: 'MAC address', type: 'text' },
            { key: 'printSpeed', label: 'Speed (ppm)', type: 'number' },
          ],
        },
        said: 'Network and speed.',
      };
    },
  }),
  readSkill: async () => '',
}));

const manager = { user: 'mia', role: 'manager' as const };
const employee = { user: 'li', role: 'employee' as const };

/**
 * AI 建议字段 (2026-10-20): the model suggests a category's extended fields
 * from the category as the server reads it and the fields its kind's other
 * categories carry, under the grant that edits a category.
 */
describe('suggesting a category’s fields', () => {
  let app: TestApp;
  let printerId = '';
  const ask = (who: typeof manager | typeof employee = manager) =>
    app.request('/api/itam/ai/read', {
      ...json({
        task: 'categoryFields',
        material: 'Printer',
        context: { categoryId: printerId },
        language: 'en-US',
      }),
      ...who,
    });
  const created = async (body: Record<string, unknown>) => {
    const response = await app.request('/api/itam/master/categories', {
      ...json(body),
      ...manager,
    });
    if (response.status !== 201) throw new Error(await response.text());
    return ((await response.json()) as { data: { id: string } }).data.id;
  };

  beforeEach(async () => {
    model.asked = [];
    app = await createTestApp({ seeds: true });
    await app.mount(masterDataRoutes);
    await app.mount(aiRoutes);
    const parent = await created({ name: 'Office', appliesTo: 'device' });
    await created({
      name: 'Scanner',
      parentId: parent,
      appliesTo: 'device',
      fieldTemplate: [
        { key: 'macAddress', label: 'MAC address', type: 'text' },
      ],
    });
    printerId = await created({
      name: 'Printer',
      parentId: parent,
      appliesTo: 'device',
      fieldTemplate: [{ key: 'color', label: 'Colour', type: 'boolean' }],
    });
  });
  afterEach(async () => {
    await app.destroy();
  });

  it('reads the category and its kind’s other fields, and answers the fields', async () => {
    const response = await ask();
    expect(response.status).toBe(200);
    const { data } = (await response.json()) as {
      data: { reading: { fields: { key: string }[] } };
    };
    expect(data.reading.fields.map((field) => field.key)).toEqual([
      'macAddress',
      'printSpeed',
    ]);
    const asked = model.asked[0];
    expect(asked).toContain('"path":"Office / Printer"');
    expect(asked).toContain('"currentFields":[{"key":"color"');
    expect(asked).toContain('"path":"Office / Scanner"');
  });

  it('is refused to whoever may not edit a category', async () => {
    expect((await ask(employee)).status).toBe(403);
    expect(model.asked).toEqual([]);
  });
});
