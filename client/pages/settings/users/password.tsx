// Reset password (/settings/users/:userId/password): a new password, typed
// twice, for the user loaded afresh.
import { useToaster } from '@nocobase/app-client';
import { useMemo, useState, type ReactElement } from 'react';
import { useParams } from 'react-router';
import { z } from 'zod';

import { FormDialog, TextField } from '../shared.js';
import { errorStatus, useAdminText, useFormState } from '../hooks.js';
import { useUser, userFailure, useUsersClient } from './data.js';
import { useUserBlock } from './loaded-user.js';

const FORM_ID = 'settings-user-password';

export default function ResetPasswordDialog(): ReactElement {
  const { text } = useAdminText();
  const { userId = '' } = useParams();
  const client = useUsersClient();
  const toaster = useToaster();
  const { user, error, retry } = useUser(userId);
  const { blocked, closeLabel, markGone } = useUserBlock(user, error, retry);
  const schema = useMemo(
    () =>
      z
        .object({
          password: z.string().min(8, text('users.errors.password')),
          confirm: z.string(),
        })
        .refine((values) => values.password === values.confirm, {
          error: text('users.errors.mismatch'),
          path: ['confirm'],
        }),
    [text],
  );
  const form = useFormState(schema, { password: '', confirm: '' }, FORM_ID);
  const [rootError, setRootError] = useState<string>();

  async function submit(): Promise<boolean> {
    if (!user) return false;
    const values = form.validate();
    if (!values) return false;
    setRootError(undefined);
    try {
      await client.resetPassword(user.id, values.password);
      toaster.show({
        type: 'success',
        title: text('users.toasts.password', { name: user.name }),
      });
      return true;
    } catch (caught: unknown) {
      if (errorStatus(caught) === 404) {
        markGone();
        return false;
      }
      setRootError(userFailure(caught, text, form.setError, ['password']));
      return false;
    }
  }

  return (
    <FormDialog
      title={text('users.dialogs.passwordTitle')}
      description={
        user
          ? text('users.dialogs.passwordDescription', { name: user.name })
          : undefined
      }
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
        name='password'
        type='password'
        autoComplete='new-password'
        label={text('users.fields.newPassword')}
        hint={text('users.hints.password')}
        required
        value={form.values.password}
        onChange={(value) => form.set('password', value)}
        error={form.errors.password}
      />
      <TextField
        formId={FORM_ID}
        name='confirm'
        type='password'
        autoComplete='new-password'
        label={text('users.fields.confirmPassword')}
        required
        value={form.values.confirm}
        onChange={(value) => form.set('confirm', value)}
        error={form.errors.confirm}
      />
    </FormDialog>
  );
}
