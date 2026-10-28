import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, it, vi } from 'vitest';

import { FieldActions } from '../../client/components/itam/field-actions.js';
import { ProductKeyValue } from '../../client/pages/itam/entitlements/product-key.js';

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('../../client/lib/itam/permissions.js', () => ({
  useCollectionPermissions: () => ({ viewKey: true }),
}));
vi.mock('../../client/lib/itam/api.js', async (original) => ({
  ...(await original<object>()),
  useApi: () => ({
    request: async () => ({ data: { productKey: 'ABCD-1234' } }),
  }),
}));

const wrap = (children: ReactNode) => (
  <QueryClientProvider client={new QueryClient()}>
    {children}
  </QueryClientProvider>
);

it("puts a key's controls among the field's hover icons, at its end", async () => {
  const { container } = render(
    wrap(
      <FieldActions onEdit={() => undefined} copy={false}>
        <ProductKeyValue entitlementId='e1' hasKey />
      </FieldActions>,
    ),
  );
  const reveal = await screen.findByRole('button', {
    name: 'entitlements.revealKey',
  });
  // Beside 编辑 in the floating icons, not inline after the mask.
  const icons = container.querySelector('.absolute');
  expect(icons?.contains(reveal)).toBe(true);
  expect(
    icons?.contains(screen.getByRole('button', { name: 'actions.copy' })),
  ).toBe(true);
  expect(
    icons?.contains(screen.getByRole('button', { name: 'actions.edit' })),
  ).toBe(true);
  fireEvent.click(reveal);
  await waitFor(() => expect(screen.getByText('ABCD-1234')).toBeTruthy());
});

it('keeps the controls beside the key outside a field', () => {
  const { container } = render(
    wrap(<ProductKeyValue entitlementId='e1' hasKey />),
  );
  expect(container.querySelector('.absolute')).toBeNull();
  expect(
    screen.getByRole('button', { name: 'entitlements.revealKey' }),
  ).toBeTruthy();
});
