// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { masterDataRoutes } from '../../server/routes/itam/master-data.js';
import { createTestApp, json, type TestApp } from '../support/test-app.js';

const manager = { user: 'mia', role: 'manager' as const };
const employee = { user: 'eve', role: 'employee' as const };

interface Capture {
  readonly values: Record<string, string | number>;
  readonly manufacturerName: string | null;
  readonly duplicates: readonly { id: string; name: string }[];
  readonly uncertain: readonly string[];
  readonly sources: readonly { title: string; url: string }[];
}

describe('AI 整理 for a new model or software product', () => {
  let app: TestApp;
  const ids: Record<string, string> = {};
  const post = (
    path: string,
    body: Record<string, unknown> = {},
    who: Record<string, string> = manager,
  ) => app.request(`/api/itam/${path}`, { ...json(body), ...who });
  const data = async <T>(response: Response): Promise<T> =>
    ((await response.json()) as { data: T }).data;
  const created = async (path: string, body: Record<string, unknown>) => {
    const response = await post(path, body);
    if (response.status !== 201)
      throw new Error(`${path}: ${await response.text()}`);
    return (await data<{ id: string }>(response)).id;
  };
  const match = async (
    collection: string,
    body: Record<string, unknown>,
  ): Promise<Capture> => {
    const response = await post(`master/${collection}/capture/match`, body);
    expect(response.status).toBe(200);
    return data<Capture>(response);
  };

  beforeEach(async () => {
    app = await createTestApp({ seeds: true });
    await app.mount(masterDataRoutes);
    ids.maker = await created('master/manufacturers', {
      name: 'Testmaker Technologies',
    });
    ids.laptops = await created('master/categories', {
      name: 'Test Laptop',
      appliesTo: 'device',
    });
    ids.design = await created('master/categories', {
      name: 'Test Design',
      appliesTo: 'entitlement',
    });
    ids.book = await created('master/models', {
      name: 'Testbook Pro 14',
      categoryId: ids.laptops,
      manufacturerId: ids.maker,
      code: 'TBP14-T3',
    });
    ids.sketcher = await created('master/softwareProducts', {
      name: 'Test Sketcher',
      categoryId: ids.design,
      deliveryMethod: 'saas',
    });
  });

  afterEach(async () => {
    await app.destroy();
  });

  it('keeps what holds of a model and checks it against the books', async () => {
    const capture = await match('models', {
      name: '  Testbook Air 13 ',
      code: 'TBA13-T1',
      // The maker as people call it is enough when only one contains it.
      manufacturerName: 'Testmaker',
      categoryId: ids.laptops,
      specification: '13-inch\n16 GB',
      warrantyMonths: 36,
      releaseDate: '2025-03-04',
      // Not a date that exists; and a guess the form must not take.
      eolDate: '2027-02-30',
      eosDate: 'soon',
      uncertain: ['manufacturer', 'eolDate', 'specification', 'nonsense'],
      sources: [
        {
          title: 'Testmaker spec sheet',
          url: 'https://testmaker.example/tba13',
        },
        { title: 'Same page again', url: 'https://testmaker.example/tba13' },
        { title: 'Not a web page', url: 'javascript:alert(1)' },
        { url: 'https://reviews.example/tba13' },
      ],
    });
    expect(capture.values).toEqual({
      name: 'Testbook Air 13',
      code: 'TBA13-T1',
      manufacturerId: ids.maker,
      categoryId: ids.laptops,
      specification: '13-inch\n16 GB',
      warrantyMonths: 36,
      releaseDate: '2025-03-04',
    });
    expect(capture.manufacturerName).toBeNull();
    expect(capture.duplicates).toEqual([]);
    // Only fields the form shows and the reading filled stay uncertain.
    expect(capture.uncertain).toEqual(['manufacturerId', 'specification']);
    expect(capture.sources).toEqual([
      { title: 'Testmaker spec sheet', url: 'https://testmaker.example/tba13' },
      {
        title: 'https://reviews.example/tba13',
        url: 'https://reviews.example/tba13',
      },
    ]);
  });

  it('never creates a maker, and holds a category to the record’s kind', async () => {
    const capture = await match('models', {
      name: 'Phone X',
      manufacturerName: 'Unknown Phones Inc.',
      // A software category is no model's.
      categoryId: ids.design,
    });
    expect(capture.values).toEqual({ name: 'Phone X' });
    expect(capture.manufacturerName).toBe('Unknown Phones Inc.');
  });

  it('points out a model already on the books', async () => {
    // By part code, however it is spaced or cased.
    expect(
      (await match('models', { name: 'Something else', code: 'tbp14 t3' }))
        .duplicates,
    ).toEqual([{ id: ids.book, name: 'Testbook Pro 14' }]);
    // By name, with the maker in front.
    expect(
      (
        await match('models', {
          name: 'Testmaker Technologies Testbook Pro 14',
        })
      ).duplicates,
    ).toEqual([{ id: ids.book, name: 'Testbook Pro 14' }]);
    // A different generation is not the same model.
    expect(
      (await match('models', { name: 'Testbook Pro 16' })).duplicates,
    ).toEqual([]);
  });

  it('keeps what holds of a software product', async () => {
    const capture = await match('softwareProducts', {
      name: 'test sketcher',
      manufacturerName: 'Testmaker Technologies',
      categoryId: ids.design,
      deliveryMethod: 'cloud',
      description: 'Draws things.',
      website: 'ftp://sketcher.example',
      // Model fields are not a product's.
      code: 'TS-1',
      uncertain: ['code', 'description'],
    });
    expect(capture.values).toEqual({
      name: 'test sketcher',
      manufacturerId: ids.maker,
      categoryId: ids.design,
      description: 'Draws things.',
    });
    expect(capture.uncertain).toEqual(['description']);
    expect(capture.duplicates).toEqual([
      { id: ids.sketcher, name: 'Test Sketcher' },
    ]);
    expect(
      (
        await match('softwareProducts', {
          name: 'Other',
          deliveryMethod: 'both',
          website: 'https://other.example',
        })
      ).values,
    ).toEqual({
      name: 'Other',
      deliveryMethod: 'both',
      website: 'https://other.example/',
    });
  });

  it('fills the category’s fields, each by its type', async () => {
    const monitors = await created('master/categories', {
      name: 'Test Monitor',
      appliesTo: 'device',
      fieldTemplate: [
        {
          key: 'screenSize',
          label: 'Screen size',
          type: 'select',
          options: ['24', '27'],
        },
        { key: 'refresh', label: 'Refresh', type: 'number' },
        { key: 'speakers', label: 'Speakers', type: 'boolean' },
        { key: 'launched', label: 'Launched', type: 'date' },
        { key: 'panel', label: 'Panel', type: 'text' },
        { key: 'assetLabel', label: 'Label', type: 'text' },
        // Hidden: kept with its values, not asked for.
        {
          key: 'legacy',
          label: 'Legacy',
          type: 'text',
          hidden: true,
        },
      ],
    });
    const capture = await match('models', {
      name: 'Testview 27',
      categoryId: monitors,
      attributes: {
        screenSize: ' 27 ',
        refresh: '144',
        speakers: false,
        launched: '2025-02-30',
        panel: { nested: true },
        assetLabel: 'X-1',
        legacy: 'old',
        unknown: 'dropped',
      },
      uncertain: ['refresh', 'attributes.screenSize', 'attributes.panel'],
    });
    expect(capture.values.attributes).toEqual({
      screenSize: '27',
      refresh: 144,
      speakers: false,
      assetLabel: 'X-1',
    });
    expect(capture.uncertain).toEqual([
      'attributes.refresh',
      'attributes.screenSize',
    ]);
    // A size that is not one of the options is no answer.
    expect(
      (
        await match('models', {
          name: 'Testview 32',
          categoryId: monitors,
          attributes: { screenSize: '32' },
        })
      ).values.attributes,
    ).toBeUndefined();
  });

  it('asks for create, and only for models and software products', async () => {
    expect(
      (
        await post(
          'master/models/capture/match',
          { name: 'Testbook Air 13' },
          employee,
        )
      ).status,
    ).toBe(403);
    expect(
      (await post('master/vendors/capture/match', { name: 'Northwind' }))
        .status,
    ).toBe(400);
  });
});
