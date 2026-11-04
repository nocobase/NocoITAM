import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';

import SettingsPage from '../../client/pages/settings/index.js';

const state = vi.hoisted(() => ({ phone: false }));
vi.mock('#hooks/use-mobile', () => ({ useIsMobile: () => state.phone }));
vi.mock('@nocobase/app-plugin-authorization/client', () => ({
  useCan: () => ({ can: true, isPending: false }),
}));
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function Address() {
  return <output>{useLocation().pathname}</output>;
}

const land = () =>
  render(
    <MemoryRouter initialEntries={['/settings/itam']}>
      <SettingsPage />
      <Address />
    </MemoryRouter>,
  );

beforeEach(() => {
  state.phone = false;
});

it('shows the pages as tabs above a phone', () => {
  land();
  expect(
    screen.getByRole('tab', { name: 'navigation.users' }),
  ).toBeInTheDocument();
  expect(screen.queryByRole('combobox')).toBeNull();
});

// A phone chooses from a menu of them all, which replaces the address as the
// tabs do (2026-11-04, as NocoCRM's).
it('shows a menu of the pages on a phone', async () => {
  state.phone = true;
  land();
  expect(screen.queryByRole('tab')).toBeNull();
  const menu = screen.getByRole('combobox', {
    name: 'navigation.settingsGroup',
  });
  await userEvent.click(menu);
  await userEvent.click(
    await screen.findByRole('option', { name: 'navigation.users' }),
  );
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent('/settings/users'),
  );
});
