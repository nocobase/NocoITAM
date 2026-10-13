// Change roles (/settings/users/:userId/roles): the user's roles, from
// the user loaded afresh, replaced as a whole; authorization keeps the last
// administrator (LAST_ASSIGNMENT).
import { useToaster } from '@nocobase/app-client';
import { useMemo, useState, type ReactElement } from 'react';
import { useOutletContext, useParams } from 'react-router';
import { z } from 'zod';

import { FormDialog } from '../shared.js';
import { errorStatus, useAdminText, useFormState } from '../hooks.js';
import {
  rolesOf,
  useRoleScope,
  useUser,
  userFailure,
  useUsersClient,
  type UsersOutletContext,
} from './data.js';
import { useUserBlock } from './loaded-user.js';
import { RoleChecks } from './role-checks.js';

const FORM_ID = 'settings-user-roles';

export default function UserRolesDialog(): ReactElement {
  const { text } = useAdminText();
  const { userId = '' } = useParams();
  const client = useUsersClient();
  const toaster = useToaster();
  const { reload } = useOutletContext<UsersOutletContext>();
  const { scope } = useRoleScope();
  const { user, error, retry } = useUser(userId);
  const { blocked, closeLabel, markGone } = useUserBlock(user, error, retry);
  const schema = useMemo(
    () =>
      z.object({
        roles: z.array(z.string()).min(1, text('users.errors.roles')),
      }),
    [text],
  );
  const form = useFormState(schema, { roles: [] }, FORM_ID);
  const [seeded, setSeeded] = useState<string>();
  const initial = user ? rolesOf(user, scope) : [];
  if (user && scope && seeded !== user.id) {
    setSeeded(user.id);
    form.reset({ roles: rolesOf(user, scope) });
  }
  const [rootError, setRootError] = useState<string>();

  async function submit(): Promise<boolean> {
    if (!user || !scope) return false;
    const values = form.validate();
    if (!values) return false;
    setRootError(undefined);
    try {
      await client.replaceRoleScope(user.id, scope.key, values.roles);
      toaster.show({
        type: 'success',
        title: text('users.toasts.roles', { name: user.name }),
      });
      reload();
      return true;
    } catch (caught: unknown) {
      if (errorStatus(caught) === 404) {
        markGone();
        return false;
      }
      setRootError(userFailure(caught, text, form.setError, []));
      return false;
    }
  }

  return (
    <FormDialog
      title={text('users.dialogs.rolesTitle')}
      description={
        user
          ? text('users.dialogs.rolesDescription', { name: user.name })
          : undefined
      }
      className='sm:max-w-md'
      formId={FORM_ID}
      submitLabel={text('common.save')}
      submit={submit}
      // The roles are not offered yet (loading) or could not load (R-5).
      submitDisabled={!scope}
      rootError={rootError}
      blocked={blocked}
      closeLabel={closeLabel}
    >
      <RoleChecks
        formId={FORM_ID}
        value={form.values.roles}
        initial={initial}
        onChange={(value) => form.set('roles', value)}
        error={form.errors.roles}
        required
      />
    </FormDialog>
  );
}
