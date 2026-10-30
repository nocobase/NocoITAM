import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { expect, it, vi } from 'vitest';

import { PurchaseOrderGeneratedTab } from '../../client/pages/itam/procurement/po-domain.js';

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('../../client/lib/itam/api.js', () => ({
  useApi: () => ({ request: vi.fn() }),
  // What the device and the stock record hold now.
  useItamList: (path: string) => ({
    data: {
      data:
        path === 'itam/devices'
          ? [
              {
                id: 'd1',
                deviceNo: 'DE-000108',
                name: 'MacBook Air 13 M3',
                serialNo: 'SN1',
                locationId: 'floor3',
              },
            ]
          : path === 'itam/stock'
            ? [{ id: 's1', locationId: 'store' }]
            : [],
    },
  }),
}));
vi.mock('../../client/lib/itam/references.js', () => ({
  referenceRoute: (collection: string) => collection,
  useReferenceNames: () => ({
    stockItems: new Map([['s1', 'Latitude 5440 battery']]),
    entitlements: new Map([['e1', 'ChatGPT Team']]),
    models: new Map([
      ['m1', 'MacBook Air 13 M3'],
      ['m2', 'Latitude 5440 Battery'],
    ]),
    softwareProducts: new Map([['p1', 'ChatGPT']]),
    locations: new Map([
      ['floor3', '3 楼'],
      ['store', '仓库'],
    ]),
  }),
}));
vi.mock('../../client/lib/itam/record-drawer.js', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../client/lib/itam/record-drawer.js')
  >()),
  useOpenRecord: () => vi.fn(),
}));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({
    data: {
      receipts: [
        { generatedId: 'd1', quantity: 1, createdAt: '2026-10-30T14:15:00Z' },
        { generatedId: 's1', quantity: 1, createdAt: '2026-10-30T14:15:00Z' },
        { generatedId: 'e1', quantity: 1, createdAt: '2026-10-30T14:15:00Z' },
      ],
      // Stock and entitlements before the device, as the service may list
      // them: the table still leads with the device.
      generated: [
        { type: 'stockItem', id: 's1', kind: 'consumable', modelId: 'm2' },
        {
          type: 'entitlement',
          id: 'e1',
          kind: 'subscription',
          softwareProductId: 'p1',
        },
        { type: 'device', id: 'd1', modelId: 'm1' },
      ],
    },
  }),
}));

it('lists everything an order brought in as one table, devices first', () => {
  render(
    <MemoryRouter initialEntries={['/purchases/po1']}>
      <Routes>
        <Route path='/purchases/:id' element={<PurchaseOrderGeneratedTab />} />
      </Routes>
    </MemoryRouter>,
  );
  expect(screen.getAllByRole('table')).toHaveLength(1);
  const [, device, battery, seats] = screen.getAllByRole('row');
  expect(within(device!).getByText('SN1')).toBeVisible();
  expect(within(device!).getByRole('link', { name: '3 楼' })).toHaveAttribute(
    'href',
    '/locations/floor3',
  );
  expect(
    within(device!).getByRole('link', { name: 'MacBook Air 13 M3' }),
  ).toHaveAttribute('href', '/models/m1');
  // A device's present status is its own page's to say.
  expect(within(device!).queryByText(/enums\.deviceStatus/)).toBeNull();
  expect(within(battery!).getByText('Latitude 5440 battery')).toBeVisible();
  expect(within(battery!).getByText('仓库')).toBeVisible();
  expect(within(seats!).getByText('ChatGPT Team')).toBeVisible();
});
