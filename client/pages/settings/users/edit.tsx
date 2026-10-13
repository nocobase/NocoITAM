// Edit user (/settings/users/:userId/edit): name, username and email, from
// the user loaded afresh; only the fields the person changed are sent, so a
// field left alone never overwrites someone else's change (guideline R1).
import { useToaster } from '@nocobase/app-client';
import type { UpdateUserInput } from '@nocobase/app-plugin-users/client/user-client';
import { useMemo, useState, type ReactElement } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { FormDialog, TextField } from '../shared.js';
import { errorStatus, useAdminText, useFormState } from '../hooks.js';
import {
  useUser,
  userFailure,
  useUsersClient,
  type UsersOutletContext,
} from './data.js';
import { useUserBlock } from './loaded-user.js';
import { userSchema } from './schema.js';

const FORM_ID = 'settings-user-edit';

export default function EditUserDialog(): ReactElement {
  const { text } = useAdminText();
  const { userId = '' } = useParams();
  const client = useUsersClient();
  const toaster = useToaster();
  const { reload } = useOutletContext<UsersOutletContext>();
  const { user, error, retry } = useUser(userId);
  const { blocked, closeLabel, markGone } = useUserBlock(user, error, retry);
  const schema = useMemo(() => userSchema(text), [text]);
  const form = useFormState(
    schema,
    { name: '', username: '', email: '' },
    FORM_ID,
  );
  const [seeded, setSeeded] = useState<string>();
  if (user && seeded !== user.id) {
    setSeeded(user.id);
    form.reset({
      name: user.name,
      username: user.username ?? '',
      email: user.email,
    });
  }
  const [rootError, setRootError] = useState<string>();

  async function submit(): Promise<boolean> {
    if (!user) return false;
    const values = form.validate();
    if (!values) return false;
    const changes: {
      -readonly [K in keyof UpdateUserInput]: UpdateUserInput[K];
    } = {};
    if (values.name !== user.name) changes.name = values.name;
    if (values.email !== user.email) changes.email = values.email;
    if (values.username !== (user.username ?? ''))
      changes.username = values.username === '' ? null : values.username;
    setRootError(undefined);
    try {
      const saved =
        Object.keys(changes).length > 0
          ? await client.update(user.id, changes)
          : user;
      toaster.show({
        type: 'success',
        title: text('users.toasts.saved', { name: saved.name }),
      });
      reload();
      return true;
    } catch (caught: unknown) {
      if (errorStatus(caught) === 404) {
        markGone();
        return false;
      }
      setRootError(
        userFailure(caught, text, form.setError, ['name', 'username', 'email']),
      );
      return false;
    }
  }

  return (
    <FormDialog
      title={text('users.dialogs.editTitle')}
      className='sm:max-w-md'
      formId={FORM_ID}
      submitLabel={text('common.save')}
      submit={submit}
      rootError={rootError}
      blocked={blocked}
      closeLabel={closeLabel}
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
    </FormDialog>
  );
}
