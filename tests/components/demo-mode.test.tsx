import { ApiClientError, apiClientToken } from '@nocobase/app-client';
import {
  AuthorizationClient,
  authorizationClientToken,
} from '@nocobase/app-plugin-authorization/client';
import { answerApi, renderWithApp } from '@nocobase/app-testing/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import DemoSettingsPage from '../../client/pages/itam/settings/demo.js';
import { apiErrorBody } from '../../client/lib/itam/api.js';
import enUS from '../../client/locales/en-US.js';

async function renderPage(mode: unknown) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderWithApp(
    <QueryClientProvider client={client}>
      <DemoSettingsPage />
    </QueryClientProvider>,
    {
      route: '/settings/demo',
      namespace: 'itam',
      namespaces: { itam: enUS },
      fetch: answerApi(({ path }) => {
        if (path === 'demoMode/status') return mode;
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
      services: (app) =>
        app.container.singleton(
          authorizationClientToken,
          (resolver) =>
            new AuthorizationClient(resolver.resolve(apiClientToken)),
        ),
    },
  );
}

it('keeps normal sample generation available when Demo Mode is disabled', async () => {
  await renderPage({ data: { enabled: false } });
  expect(
    await screen.findByRole('button', { name: enUS.settings.demo.generate }),
  ).toBeInTheDocument();
});

it('does not expose the normal generator when demo status fails', async () => {
  await renderPage(
    Response.json({ error: { message: 'Unavailable' } }, { status: 503 }),
  );
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: enUS.settings.demo.generate }),
  ).not.toBeInTheDocument();
});

it('requires plugin management permission in Demo Mode', async () => {
  await renderPage({ data: { enabled: true } });
  expect(
    await screen.findByText(/You do not have permission/),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: enUS.settings.demo.generate }),
  ).not.toBeInTheDocument();
});

it.each([403, 404])(
  'does not offer Retry for a permanent status failure (%s)',
  async (status) => {
    await renderPage(
      Response.json({ error: { message: 'Internal details' } }, { status }),
    );
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Internal details')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Retry' }),
    ).not.toBeInTheDocument();
  },
);

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
