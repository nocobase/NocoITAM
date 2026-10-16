import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';

import type { ItamRecord } from '../../client/lib/itam/api.js';
import { DomainDetailPage } from '../../client/pages/itam/domain-detail.js';
import { masterDomain } from '../../client/pages/itam/master/master-domain.js';

// The master-data collections render through the generic domain pages
// (2026-09-28); what only reference data does reaches them through the
// DomainConfig slots `masterDomain()` fills in.

const state = vi.hoisted(() => ({
  records: {} as Record<string, ItamRecord | undefined>,
}));
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('../../client/lib/itam/api.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useApi: () => ({ request: vi.fn(() => new Promise(() => {})) }),
  useItamRecord: (path: string, id: string | undefined) => ({
    data: id ? state.records[`${path}/${id}`] : undefined,
    isLoading: false,
  }),
  useItamList: () => ({ data: undefined }),
  useItamMutations: () => ({ update: {}, remove: {}, create: {} }),
  useDeleteImpact: () => ({}),
  useRelatedCounts: () => [],
  useRowCounts: () => [],
}));
// The assistant is not configured: a model's page offers no AI 补充.
vi.mock('../../client/lib/itam/ai-chat.js', () => ({
  useItamAi: () => ({ available: false }),
  useAiPageContext: () => ({ available: false, ask: () => undefined }),
}));
vi.mock('../../client/lib/itam/permissions.js', () => ({
  useCollectionPermissions: () => ({}),
  useCurrentUserId: () => 'u1',
}));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useQuery: () => ({ data: undefined }),
}));
vi.mock('../../client/lib/itam/references.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useReferenceNames: () => ({
    manufacturers: new Map([['m1', 'Logitech']]),
  }),
}));

// The picture needs the file repository of a running client.
vi.mock('../../client/components/itam/record-image.js', () => ({
  RecordImage: ({ alt }: { alt: string }) => <img alt={alt} />,
  RecordThumbnail: () => null,
}));

beforeEach(() => {
  state.records = {};
});

function landOn(domainName: string, route: string) {
  return render(
    <MemoryRouter initialEntries={[`/${route}/r1`]}>
      <Routes>
        <Route
          path={`/${route}/:id`}
          element={<DomainDetailPage domain={masterDomain(domainName)} />}
        >
          <Route path='devices' element={<p>Devices tab</p>} />
          <Route path='stock' element={<p>Stock tab</p>} />
          <Route path='models' element={<p>Models tab</p>} />
          <Route path='softwareProducts' element={<p>Products tab</p>} />
          <Route path='history' element={<p>History tab</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

// Every record opens on its history, the first tab (2026-10-14); a model's
// other tabs still follow its category.
it('opens a stock model on its history, its tabs following its category', () => {
  state.records = {
    'itam/master/models/r1': {
      id: 'r1',
      name: 'MX Keys',
      manufacturerId: 'm1',
      categoryId: 'c1',
    },
    'itam/master/categories/c1': { id: 'c1', appliesTo: 'accessory' },
  };
  landOn('models', 'models');
  expect(screen.getByText('History tab')).toBeVisible();
  const tabs = within(screen.getByRole('navigation', { name: 'tabs' }))
    .getAllByRole('link')
    .map((link) => link.textContent);
  expect(tabs[0]).toBe('tabs.history');
  // A model has devices or stock, never both.
  expect(screen.getByRole('link', { name: 'tabs.stock' })).toBeVisible();
  expect(screen.queryByRole('link', { name: 'tabs.devices' })).toBeNull();
  // "Manufacturer / Name" in the title, the picture at the head of the card.
  expect(screen.getByText('Logitech /')).toBeVisible();
  expect(screen.getByRole('img', { name: 'MX Keys' })).toBeVisible();
  // The device type is its category's, stated under the category.
  expect(screen.getByText('fields.appliesTo')).toBeVisible();
});

it('opens a software category on its history, beside its products', () => {
  state.records = {
    'itam/master/categories/r1': {
      id: 'r1',
      name: 'Design',
      appliesTo: 'entitlement',
    },
  };
  landOn('categories', 'categories');
  expect(screen.getByText('History tab')).toBeVisible();
  expect(
    screen.getByRole('link', { name: 'navigation.softwareProducts' }),
  ).toBeVisible();
  // No timestamp strip: reference data keeps them in the system section.
  expect(screen.getAllByText('fields.createdAt')).toHaveLength(1);
});

it('describes each collection for the generic pages', () => {
  const models = masterDomain('models');
  expect(models.path).toBe('itam/master/models');
  expect(models.route).toBe('models');
  expect(models.titlePrefixField).toBe('manufacturerId');
  expect(models.nameSort).toBe('manufacturerName');
  expect(models.image).toBe(true);
  expect(models.listColumns?.map((column) => column.key)).toEqual([
    'appliesTo',
    'total',
  ]);
  expect(
    models.filterFields?.map((entry) =>
      typeof entry === 'string' ? entry : entry.key,
    ),
  ).toEqual(['manufacturerId', 'categoryId', 'appliesTo']);
  // The derived device type is shown, never edited or created.
  const kind = models.fields.find((field) => field.key === 'categoryAppliesTo');
  expect(kind?.form).toBe(false);
  // A model fills its category's fields, the defaults of its new devices.
  expect(models.extendedFields).toBe(true);

  const vendors = masterDomain('vendors');
  expect(vendors.listColumns?.map((column) => column.key)).toEqual([
    'count:purchaseOrders',
    'count:repairs',
    'count:disposals',
  ]);
  expect(vendors.Tree).toBeUndefined();
  expect(vendors.tabs?.map((tab) => tab.key)).toEqual([
    'purchaseOrders',
    'repairs',
    'disposals',
  ]);

  for (const tree of ['categories', 'locations', 'departments'])
    expect(masterDomain(tree).Tree).toBeDefined();
  // The people list has no stat cards above it (2026-10-17).
  expect(masterDomain('people').Stats).toBeUndefined();
  // A location's owner is named, not whoever typed it in.
  expect(masterDomain('locations').ownerFromCreator).toBe(false);
  // Reference data exports every readable field, so it imports back.
  expect(masterDomain('manufacturers').exportColumns).toBe('readable');
  // One object per collection, so the pages see stable slot components.
  expect(masterDomain('models')).toBe(models);
});

it("fills a new sub-category's asset type from the parent chosen", () => {
  const derive = masterDomain('categories').derive!;
  expect(
    derive(
      {
        key: 'parentId',
        value: 'cat-laptop',
        record: { id: 'cat-laptop', appliesTo: 'device' },
      },
      {},
    ),
  ).toEqual({ appliesTo: 'device' });
  // Clearing the parent leaves the type for the reader to choose.
  expect(derive({ key: 'parentId', value: null }, {})).toBeUndefined();
  expect(derive({ key: 'name', value: 'X' }, {})).toBeUndefined();
});
