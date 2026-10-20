// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { historyServiceToken } from '../../server/providers/itam/history.js';
import { aiRoutes } from '../../server/routes/itam/ai.js';
import { masterDataRoutes } from '../../server/routes/itam/master-data.js';
import { createTestApp, json, type TestApp } from '../support/test-app.js';

// What the model was asked, and its answer: two fields for a printer.
const model = vi.hoisted(() => ({ asked: [] as string[], parentId: '' }));
vi.mock('../../server/providers/itam/ai-model.js', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../server/providers/itam/ai-model.js')
  >()),
  openSession: async () => ({
    model: { modelService: 'test', model: 'reader' },
    ask: async () => '',
    askJson: async (content: string) => {
      model.asked.push(content);
      // AI 整理 of a new category: under Office, with one field whose key
      // the editor would refuse and a kind its parent overrules.
      if (content.includes('Fill the new category form'))
        return {
          reading: {
            name: 'Printer',
            parentId: model.parentId,
            appliesTo: 'consumable',
            requiresSerial: true,
            assignableToPerson: false,
            usefulLifeMonths: 60,
            residualRate: 7,
            fieldTemplate: [
              { key: 'ppm', label: 'Speed', type: 'number' },
              { key: '1bad', label: 'Bad', type: 'text' },
              { key: 'size', label: 'Paper', type: 'select' },
            ],
            uncertain: ['assignableToPerson'],
          },
          said: 'Check the rules.',
        };
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
    model.parentId = parent;
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

  it('fills a new category, checked: its parent’s kind, valid fields and the same name already there', async () => {
    const response = await app.request('/api/itam/ai/read', {
      ...json({
        task: 'category',
        material: 'Printer for the office floor',
        context: {},
        language: 'en-US',
      }),
      ...manager,
    });
    expect(response.status).toBe(200);
    const { data } = (await response.json()) as {
      data: {
        reading: {
          values: Record<string, unknown>;
          fieldTemplate: { key: string }[];
          uncertain: string[];
          duplicates: { name: string }[];
        };
      };
    };
    expect(data.reading.values).toEqual({
      name: 'Printer',
      parentId: model.parentId,
      // The parent's kind, not the one the model wrote.
      appliesTo: 'device',
      requiresSerial: true,
      assignableToPerson: false,
      usefulLifeMonths: 60,
    });
    expect(data.reading.fieldTemplate.map((field) => field.key)).toEqual([
      'ppm',
    ]);
    expect(data.reading.uncertain).toEqual(['assignableToPerson']);
    // The seeds' printer category and the test's own.
    expect(data.reading.duplicates.map((row) => row.name).sort()).toEqual([
      'Office / Printer',
      'Peripherals / Printer',
    ]);
    expect(model.asked.at(-1)).toContain('"path":"Office / Scanner"');
  });

  it('says in the history what AI filled or changed, and nothing for a plain save', async () => {
    const patch = (query: string, body: Record<string, unknown>) =>
      app.request(`/api/itam/master/categories/${printerId}${query}`, {
        ...json(body),
        method: 'PATCH',
        ...manager,
      });
    expect((await patch('?origin=ai', { warrantyMonths: 24 })).status).toBe(
      200,
    );
    expect((await patch('?origin=other', { warrantyMonths: 12 })).status).toBe(
      200,
    );
    const { data } = await app.container
      .resolve(historyServiceToken)
      .changes({ subjectType: 'categories', subjectId: printerId });
    expect(
      data
        .filter((row) => row.field === 'warrantyMonths')
        .map((row) => [row.newValue, row.origin]),
    ).toEqual([
      [12, 'human'],
      [24, 'ai'],
    ]);
  });
});
