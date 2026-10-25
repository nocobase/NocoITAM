import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';

import { DemoModeBadge } from '../../client/layouts/components/demo-mode-badge.js';

const state = vi.hoisted(() => ({
  accounts: null as
    { username: string; name: string; role: string; current: boolean }[] | null,
  signIn: vi.fn(() => Promise.resolve()),
}));
vi.mock('@nocobase/app-plugin-demo-mode/client/accounts', () => ({
  useDemoAccounts: () => ({ accounts: state.accounts, signIn: state.signIn }),
}));
vi.mock('@nocobase/app-client', () => ({
  useToaster: () => ({ show: vi.fn() }),
}));
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

beforeEach(() => {
  state.accounts = null;
  state.signIn.mockClear();
});

const at = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <DemoModeBadge />
    </MemoryRouter>,
  );

it('shows nothing outside a demo', () => {
  state.accounts = [];
  expect(at('/devices').container).toBeEmptyDOMElement();
});

// A Demo Mode deployment says so in the header, with its accounts to switch
// to on the page the visitor is on (2026-10-25).
it('says it is a demo and switches account on the same page', async () => {
  state.accounts = [
    { username: 'admin', name: 'Super Admin', role: '', current: true },
    { username: 'zhouyu', name: '周宇', role: 'IT 支持工程师', current: false },
  ];
  at('/devices?view=list');
  fireEvent.click(screen.getByRole('button', { name: /demoMode.badge/ }));
  expect(await screen.findByText('demoMode.hint')).toBeTruthy();
  fireEvent.click(await screen.findByRole('menuitemradio', { name: /周宇/ }));
  expect(state.signIn).toHaveBeenCalledWith('zhouyu', '/devices?view=list');
});
