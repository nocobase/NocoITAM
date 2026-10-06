// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  pickerSearch,
  pickerSearches,
} from '../../client/lib/itam/purchase-capture.js';
import { searchWords } from '../../server/providers/itam/collection-query.js';
import { masterDataRoutes } from '../../server/routes/itam/master-data.js';
import { createTestApp, json, type TestApp } from '../support/test-app.js';

describe('searching a list word by word', () => {
  it('splits a search into its words', () => {
    expect(searchWords('  MacBook Pro 14 (M3) ')).toEqual([
      'MacBook',
      'Pro',
      '14',
      'M3',
    ]);
    expect(searchWords('PO-000012')).toEqual(['PO-000012']);
    expect(searchWords('')).toEqual([]);
    expect(searchWords('a b c d e f g h i j')).toHaveLength(8);
  });

  it('starts an unmatched line’s picker without its configuration', () => {
    expect(pickerSearch('MacBook Pro 14 M4 16GB/512GB')).toBe(
      'MacBook Pro 14 M4',
    );
    // Chinese that only names the kind of thing goes when there is more.
    expect(pickerSearch('Dell U2724D 27英寸 显示器')).toBe('Dell U2724D');
    expect(pickerSearch('Crucial DDR5-5600 32GB 笔记本内存')).toBe(
      'Crucial DDR5-5600',
    );
    expect(pickerSearch('联想 笔记本')).toBe('联想 笔记本');
    expect(pickerSearch('Figma')).toBe('Figma');
  });

  it('falls back to the model number, then the part code', () => {
    expect(pickerSearches('Dell WD25TB4 雷电扩展坞', null)).toEqual([
      'Dell WD25TB4',
      'WD25TB4',
    ]);
    expect(
      pickerSearches('Crucial DDR5-5600 32GB 笔记本内存', 'CT32G56C46S54'),
    ).toEqual(['Crucial DDR5-5600', 'DDR5-5600', 'CT32G56C46S54']);
    expect(pickerSearches('Figma', null)).toEqual(['Figma']);
  });

  describe('through the list endpoint', () => {
    let app: TestApp;
    const manager = { user: 'mia', role: 'manager' as const };
    const names = async (q: string) =>
      (
        (await (
          await app.request(
            `/api/itam/master/models?q=${encodeURIComponent(q)}`,
            manager,
          )
        ).json()) as { data: { name: string }[] }
      ).data.map((row) => row.name);

    beforeEach(async () => {
      app = await createTestApp();
      await app.mount(masterDataRoutes);
      const post = async (path: string, body: Record<string, unknown>) =>
        (
          (await (
            await app.request(`/api/itam/master/${path}`, {
              ...json(body),
              ...manager,
            })
          ).json()) as { data: { id: string } }
        ).data.id;
      const manufacturerId = await post('manufacturers', { name: 'Testmaker' });
      const categoryId = await post('categories', {
        name: 'Test Laptop',
        appliesTo: 'device',
      });
      for (const [name, code] of [
        ['Testbook Pro 14 (T3)', 'TBP14-T3'],
        ['Testbook Air 13 (T2)', 'TBA13-T2'],
      ])
        await post('models', { name, code, manufacturerId, categoryId });
    });

    afterEach(async () => {
      await app.destroy();
    });

    it('finds a record whatever the order of the words', async () => {
      expect(await names('Testbook Pro 14')).toEqual(['Testbook Pro 14 (T3)']);
      expect(await names('T3 Testbook')).toEqual(['Testbook Pro 14 (T3)']);
      // A word may match the part code rather than the name.
      expect(await names('Testbook TBA13')).toEqual(['Testbook Air 13 (T2)']);
      // Every word must match: another generation is not this model.
      expect(await names('Testbook Pro 14 T4')).toEqual([]);
      // A word may be the maker, which the name leaves out.
      expect(await names('Testmaker Air')).toEqual(['Testbook Air 13 (T2)']);
      expect((await names('Testbook')).sort()).toEqual([
        'Testbook Air 13 (T2)',
        'Testbook Pro 14 (T3)',
      ]);
    });
  });
});
