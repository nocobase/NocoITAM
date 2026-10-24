// What ITAM adds to NocoBase 3's prepared Users page
// (client/pages/settings/accounts/, after NocoCRM's): the Invite button,
// Reset password and Delete among a row's buttons, each offered only to
// whoever holds the users plugin's action, and a refused deletion saying why.
import { apiClientToken } from '@nocobase/app-client';
import {
  AuthenticationProvider,
  authenticationClientToken,
} from '@nocobase/app-plugin-authentication/client';
import {
  AuthorizationClient,
  authorizationClientToken,
  type AuthorizationSnapshot,
} from '@nocobase/app-plugin-authorization/client';
import {
  answerApi,
  renderWithApp,
  type ApiCall,
} from '@nocobase/app-testing/client';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { expect, it, vi } from 'vitest';
import packageMetadata from '../../package.json' with { type: 'json' };
import enUS from '../../client/locales/en-US.js';
import UsersPage from '../../client/pages/settings/users.js';

const alice = {
  id: 'alice',
  name: 'Alice',
  email: 'alice@example.test',
  disabledAt: null,
  roleScopes: { app: ['itam-asset-manager'] },
};
const users = enUS.admin.users;

function setup(
  permissions: AuthorizationSnapshot,
  remove: () => Response | object = () => new Response(null, { status: 204 }),
) {
  const api = vi.fn(({ method, path }: ApiCall) => {
    if (path === 'authorization/permissions') return { data: permissions };
    if (path === 'users/options')
      return {
        data: {
          roleScopes: [
            {
              key: 'app',
              label: 'Roles',
              selection: 'multiple',
              requiredOnCreate: true,
              options: [
                {
                  value: 'itam-asset-manager',
                  label: 'itam-asset-manager',
                  labelI18nKey: 'users.roles.itam-asset-manager',
                  labelI18nNs: packageMetadata.name,
                },
              ],
            },
          ],
        },
      };
    if (path === 'users/invitations') return { data: [] };
    if (method === 'DELETE' && path === 'users/alice') return remove();
    if (path === 'users') return { data: [alice], meta: { total: 1 } };
    return new Response(null, { status: 404 });
  });
  const view = renderWithApp(
    <AuthenticationProvider>
      <Routes>
        <Route path='/settings/users' element={<UsersPage />} />
      </Routes>
    </AuthenticationProvider>,
    {
      route: '/settings/users',
      namespace: packageMetadata.name,
      namespaces: { [packageMetadata.name]: enUS },
      fetch: answerApi(api),
      services: (app) => {
        app.container.instance(authenticationClientToken, {
          getSession: async () => ({ data: null }),
        });
        app.container.singleton(
          authorizationClientToken,
          (resolver) =>
            new AuthorizationClient(resolver.resolve(apiClientToken)),
        );
      },
    },
  );
  return { api, view };
}

const everything: AuthorizationSnapshot = {
  unrestricted: true,
  permissions: [],
};

it('offers inviting, a password reset and deletion to whoever may', async () => {
  setup(everything);
  expect(await screen.findByRole('link', { name: 'Alice' })).toBeVisible();
  // The role's label, not its key.
  expect(await screen.findByText('IT Asset Manager')).toBeVisible();
  expect(
    // Drawn as a button, as New user is, with the link's address.
    (await screen.findByRole('button', { name: users.invite })).getAttribute(
      'href',
    ),
  ).toContain('/settings/users/invite');
  // Beside the page's own Disable and Revoke sessions.
  expect(
    screen
      .getByRole('button', { name: users.actions.password })
      .getAttribute('href'),
  ).toContain('/settings/users/alice/password');
  expect(
    screen.getByRole('button', { name: users.actions.delete }),
  ).toBeVisible();
});

it('deletes a user once confirmed, and says why when it is refused', async () => {
  const user = userEvent.setup();
  let refuse = true;
  const { api } = setup(everything, () =>
    refuse
      ? Response.json(
          { error: { code: 'BAD_REQUEST', message: 'holds records' } },
          { status: 400 },
        )
      : new Response(null, { status: 204 }),
  );
  await screen.findByRole('link', { name: 'Alice' });
  await user.click(
    await screen.findByRole('button', { name: users.actions.delete }),
  );
  const dialog = await screen.findByRole('alertdialog');
  expect(
    within(dialog).getByText(
      users.confirm.deleteTitle.replace('{{name}}', 'Alice'),
    ),
  ).toBeVisible();
  await user.click(
    within(dialog).getByRole('button', { name: users.actions.delete }),
  );
  expect(
    await within(dialog).findByText(users.errors.holdsRecords),
  ).toBeVisible();
  refuse = false;
  await user.click(
    within(dialog).getByRole('button', { name: users.actions.delete }),
  );
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
  );
  expect(
    api.mock.calls.filter(
      ([call]) => call.method === 'DELETE' && call.path === 'users/alice',
    ),
  ).toHaveLength(2);
});

it('offers none of them without the users plugin actions', async () => {
  setup({
    unrestricted: false,
    permissions: [
      { resource: { type: 'user', id: '*' }, action: 'read', allowed: true },
    ],
  } as unknown as AuthorizationSnapshot);
  await screen.findByText('Alice');
  expect(screen.queryByRole('button', { name: users.invite })).toBeNull();
  expect(
    screen.queryByRole('button', { name: users.actions.password }),
  ).toBeNull();
  expect(
    screen.queryByRole('button', { name: users.actions.delete }),
  ).toBeNull();
});
