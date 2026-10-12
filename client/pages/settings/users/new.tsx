// New user (/settings/users/new): an account with its password and roles,
// created in one step by the users plugin, which rolls the account back if
// its roles cannot be given.
import { useToaster } from '@nocobase/app-client';
import { useMemo, useState, type ReactElement } from 'react';
import { useOutletContext } from 'react-router';
import { z } from 'zod';

import { FormDialog, TextField } from '../shared.js';
import { useAdminText, useFormState } from '../hooks.js';
import {
  useRoleScope,
  userFailure,
  useUsersClient,
  type UsersOutletContext,
} from './data.js';
import { RoleChecks } from './role-checks.js';
import { userSchema } from './schema.js';

const FORM_ID = 'settings-user-new';

export default function NewUserDialog(): ReactElement {
  const { text } = useAdminText();
  const client = useUsersClient();
  const toaster = useToaster();
  const { reload } = useOutletContext<UsersOutletContext>();
  const { scope } = useRoleScope();
  const required = scope?.requiredOnCreate ?? false;
  const schema = useMemo(
    () =>
      userSchema(text).extend({
        password: z.string().min(8, text('users.errors.password')),
        roles: z
          .array(z.string())
          .min(required ? 1 : 0, text('users.errors.roles')),
      }),
    [text, required],
  );
  const form = useFormState(
    schema,
    { name: '', username: '', email: '', password: '', roles: [] },
    FORM_ID,
  );
  const [rootError, setRootError] = useState<string>();

  async function submit(): Promise<boolean> {
    const values = form.validate();
    if (!values) return false;
    setRootError(undefined);
    try {
      const user = await client.create({
        name: values.name,
        email: values.email,
        password: values.password,
        ...(values.username ? { username: values.username } : {}),
        ...(scope ? { roleScopes: { [scope.key]: values.roles } } : {}),
      });
      toaster.show({
        type: 'success',
        title: text('users.toasts.created', { name: user.name }),
      });
      reload();
      return true;
    } catch (error: unknown) {
      setRootError(
        userFailure(error, text, form.setError, [
          'name',
          'username',
          'email',
          'password',
        ]),
      );
      return false;
    }
  }

  return (
    <FormDialog
      title={text('users.dialogs.newTitle')}
      formId={FORM_ID}
      submitLabel={text('common.create')}
      submit={submit}
      // The roles are not offered yet (loading) or could not load (R-5).
      submitDisabled={!scope}
      rootError={rootError}
    >
      <TextField
        formId={FORM_ID}
        name='name'
        label={text('users.fields.name')}
        required
        value={form.values.name}
        onChange={(value) => form.set('name', value)}
        error={form.errors.name}
      />
      <TextField
        formId={FORM_ID}
        name='email'
        type='email'
        label={text('users.fields.email')}
        required
        value={form.values.email}
        onChange={(value) => form.set('email', value)}
        error={form.errors.email}
      />
      <TextField
        formId={FORM_ID}
        name='username'
        label={text('users.fields.username')}
        hint={text('users.hints.username')}
        value={form.values.username}
        onChange={(value) => form.set('username', value)}
        error={form.errors.username}
      />
      <TextField
        formId={FORM_ID}
        name='password'
        type='password'
        autoComplete='new-password'
        label={text('users.fields.password')}
        hint={text('users.hints.password')}
        required
        value={form.values.password}
        onChange={(value) => form.set('password', value)}
        error={form.errors.password}
      />
      <RoleChecks
        formId={FORM_ID}
        value={form.values.roles}
        onChange={(value) => form.set('roles', value)}
        error={form.errors.roles}
        required={required}
      />
    </FormDialog>
  );
}
