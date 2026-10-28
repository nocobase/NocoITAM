import demoMode from '@nocobase/app-plugin-demo-mode/client';
import { createAppClientConfig } from '@nocobase/app-client';
import { answerApi, renderWithApp } from '@nocobase/app-testing/client';
import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { HeaderActions } from '../../client/layouts/components/header-actions.js';

vi.mock('../../client/theme/index.js', () => ({ ThemeSettings: () => null }));
vi.mock('../../client/layouts/agent-chat.js', () => ({
  AgentChatButton: () => null,
}));
vi.mock('../../client/layouts/components/user-menu.js', () => ({
  UserMenu: () => null,
}));

it.each([
  ['en-US', 'Demo mode · Switch account'],
  ['zh-CN', '演示模式 · 切换账户'],
])(
  'mounts the plugin account menu in the header (%s)',
  async (locale, label) => {
    await renderWithApp(<HeaderActions />, {
      plugins: [demoMode()],
      services: (app) => {
        Object.defineProperty(app.config, 'public', {
          value: createAppClientConfig({
            rawConfig: {},
            rawPublicConfig: { demoMode: { enabled: true } },
          }).public,
        });
      },
      route: '/devices',
      locale,
      fetch: answerApi(({ path }) => {
        if (path === 'demoMode/accounts')
          return {
            data: [
              {
                username: 'nocobase',
                name: 'Super Admin',
                role: '',
                current: true,
              },
              {
                username: 'daniel',
                name: 'Daniel Brooks',
                role: 'IT Asset Manager',
                current: false,
              },
            ],
          };
        return new Response(null, { status: 404 });
      }),
    });
    fireEvent.click(await screen.findByRole('button', { name: label }));
    expect(
      await screen.findByRole('menuitemradio', { name: 'Super Admin' }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(
      screen.getByRole('menuitemradio', { name: /Daniel Brooks/ }),
    ).toHaveTextContent('IT Asset Manager');
  },
);
