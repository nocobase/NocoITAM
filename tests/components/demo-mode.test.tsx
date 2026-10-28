import {
  ApiClientError,
  apiClientToken,
  createAppClientConfig,
} from '@nocobase/app-client';
import demoMode from '@nocobase/app-plugin-demo-mode/client';
import {
  AuthorizationClient,
  authorizationClientToken,
} from '@nocobase/app-plugin-authorization/client';
import { answerApi, renderWithApp } from '@nocobase/app-testing/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import DemoSettingsPage from '../../client/pages/itam/settings/demo.js';
import { apiErrorBody } from '../../client/lib/itam/api.js';
import enUS from '../../client/locales/en-US.js';

async function renderPage(enabled: boolean) {
  const statusRequest = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await renderWithApp(
    <QueryClientProvider client={client}>
      <DemoSettingsPage />
    </QueryClientProvider>,
    {
      route: '/settings/demo',
      plugins: [demoMode()],
      namespace: 'itam',
      namespaces: { itam: enUS },
      fetch: answerApi(({ path }) => {
        if (path === 'demoMode/status') {
          statusRequest();
          return new Response(null, { status: 503 });
        }
        if (path === 'demoMode/accounts') return { data: [] };
        if (path === 'authorization/permissions')
          return { data: { unrestricted: false, permissions: [] } };
        if (path === 'itam/demo')
          return {
            data: {
              generated: false,
              importing: null,
              accounts: [],
              accountsByLanguage: { 'en-US': [], 'zh-CN': [] },
            },
          };
        return new Response(null, { status: 404 });
      }),
      services: (app) => {
        // app-testing beta.6 has no public-config option. Supply the same
        // published configuration the server injects, keeping the plugin real.
        Object.defineProperty(app.config, 'public', {
          value: createAppClientConfig({
            rawConfig: {},
            rawPublicConfig: { demoMode: { enabled } },
          }).public,
        });
        app.container.singleton(
          authorizationClientToken,
          (resolver) =>
            new AuthorizationClient(resolver.resolve(apiClientToken)),
        );
      },
    },
  );
  return statusRequest;
}

it('keeps normal sample generation available when Demo Mode is disabled', async () => {
  const statusRequest = await renderPage(false);
  expect(
    await screen.findByRole('button', { name: enUS.settings.demo.generate }),
  ).toBeInTheDocument();
  expect(statusRequest).not.toHaveBeenCalled();
});

it('uses startup Demo Mode and requires management permission without a status request', async () => {
  const statusRequest = await renderPage(true);
  expect(
    await screen.findByText(/You do not have permission/),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: enUS.settings.demo.generate }),
  ).not.toBeInTheDocument();
  expect(statusRequest).not.toHaveBeenCalled();
});

it('uses the standard API envelope localized refusal for inline errors', () => {
  const error = new ApiClientError('This is a demo. Changes cannot be saved.', {
    status: 400,
    payload: {
      error: {
        message: 'This is a demo. Changes cannot be saved.',
        localizedMessage: { locale: 'zh-CN', message: '演示模式不能修改' },
      },
    },
  });
  expect(apiErrorBody(error)?.message).toBe('演示模式不能修改');
});

it('keeps legacy flat error bodies available', () => {
  const error = new ApiClientError('Legacy failure', {
    status: 422,
    payload: { message: 'Legacy failure', rule: 'CONFLICT' },
  });
  expect(apiErrorBody(error)).toMatchObject({
    message: 'Legacy failure',
    rule: 'CONFLICT',
  });
});
