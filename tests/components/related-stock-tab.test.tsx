import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { expect, it, vi } from 'vitest';

import LocationsStockTab from '../../client/pages/itam/master/locations-stock-tab.js';
import ModelAssetsTab from '../../client/pages/itam/master/models-assets-tab.js';

// A model's 资产 tab or a location's 库存 tab lists stock items with both
// quantities under their own names: 累计入库 and 在库, not one 总计. A model's
// tab leads with each row's asset type, and lists devices for a device
// model (2026-10-21).

const kinds = vi.hoisted(() => ({ appliesTo: 'accessory' }));

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('../../client/lib/itam/api.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useApi: () => ({ request: vi.fn(() => new Promise(() => {})) }),
  useItamRecord: (path: string) => ({
    data: path.includes('categories')
      ? { id: 'c1', appliesTo: kinds.appliesTo }
      : { id: 'r1', categoryId: 'c1' },
  }),
  useItamList: () => ({
    data: {
      data: [
        {
          id: 's1',
          name: 'MX Keys',
          kind: 'accessory',
          modelId: 'm1',
          categoryId: 'c1',
          locationId: 'l1',
          totalQuantity: 12,
          availableQuantity: 7,
          minimumQuantity: 2,
        },
      ],
      total: 1,
    },
    isLoading: false,
  }),
}));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useQuery: () => ({ data: undefined }),
}));
vi.mock('../../client/lib/itam/references.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useReferenceNames: () => ({}),
}));
vi.mock('../../client/lib/itam/record-drawer.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useOpenRecord: () => vi.fn(),
}));

function headers(tab: ReactElement): string[] {
  render(
    <MemoryRouter initialEntries={['/r1']}>
      <Routes>
        <Route path='/:id' element={tab} />
      </Routes>
    </MemoryRouter>,
  );
  return screen
    .getAllByRole('columnheader')
    .map((header) => header.textContent ?? '');
}

it('shows a model’s stock as stocked total and in stock, by asset type', () => {
  kinds.appliesTo = 'accessory';
  expect(headers(<ModelAssetsTab />)).toEqual([
    'fields.appliesTo',
    'fields.name',
    'fields.location',
    'fields.stockedTotal',
    'fields.inStock',
  ]);
  expect(screen.getByText('12')).toBeTruthy();
  expect(screen.getByText('7')).toBeTruthy();
});

it('shows a location’s stock the same way, by model', () => {
  expect(headers(<LocationsStockTab />)).toEqual([
    'fields.name',
    'fields.model',
    'fields.stockedTotal',
    'fields.inStock',
  ]);
});

it('lists a device model’s devices without a type column', () => {
  kinds.appliesTo = 'device';
  expect(headers(<ModelAssetsTab />)).not.toContain('fields.appliesTo');
});
