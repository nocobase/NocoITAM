import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';

import { UserMenu } from '../../client/layouts/components/user-menu.js';
import { PresetContext } from '../../client/theme/theme-context.js';

const state = vi.hoisted(() => ({
  theme: 'light',
  setTheme: vi.fn(),
  setPreset: vi.fn(),
}));
vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => ({
    client: { signOut: vi.fn() },
    session: { user: { name: 'Test user' } },
    refresh: vi.fn(),
  }),
}));
vi.mock('@nocobase/app-plugin-authentication/client/actions', () => ({
  useAuthenticationErrorResolver: () => vi.fn(),
}));
vi.mock('@nocobase/app-client', () => ({
  useToaster: () => ({ show: vi.fn() }),
}));
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));
vi.mock('../../client/layouts/components/language-switcher.js', () => ({
  LanguageSwitcher: () => null,
}));
vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: state.theme, setTheme: state.setTheme }),
}));

beforeEach(() => {
  state.theme = 'light';
  state.setTheme.mockReset();
  state.setPreset.mockReset();
});

// 外观 is in the account menu, the header having no palette button of its
// own (2026-11-03, as NocoCRM's).
it('changes the colour mode and the theme from the account menu', async () => {
  render(
    <MemoryRouter>
      <PresetContext.Provider
        value={{ preset: 'compact', setPreset: state.setPreset }}
      >
        <UserMenu />
      </PresetContext.Provider>
    </MemoryRouter>,
  );
  screen.getByRole('button', { name: 'account.openMenu' }).focus();
  await userEvent.keyboard('{Enter}');
  const appearance = await screen.findByRole('menuitem', {
    name: /appearance\.title/u,
  });
  expect(appearance.textContent).toContain('appearance.light');
  await userEvent.click(appearance);
  expect(
    await screen.findByRole('menuitemradio', { name: 'appearance.light' }),
  ).toHaveAttribute('aria-checked', 'true');
  await userEvent.click(
    screen.getByRole('menuitemradio', { name: 'appearance.dark' }),
  );
  expect(state.setTheme).toHaveBeenCalledWith('dark');
  await userEvent.click(
    screen.getByRole('menuitemradio', { name: 'appearance.themes.default' }),
  );
  expect(state.setPreset).toHaveBeenCalledWith('default');
});
