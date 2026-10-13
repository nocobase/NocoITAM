// Rename permission set: from a row's menu (/settings/permission-sets/
// edit/:setKey) or a set's page header (…/:setKey/<tab>/edit). Only the
// title is sent, so a rename never touches the set's grants (guideline R1);
// a set's key does not change.
import { useApiClient, useToaster } from '@nocobase/app-client';
import { useAuthorizationClient } from '@nocobase/app-plugin-authorization/client';
import { useMemo, useState, type ReactElement } from 'react';
import { useOutletContext, useParams } from 'react-router';
import { z } from 'zod';

import { Skeleton } from '#components/ui/skeleton';

import { FormDialog, LoadFailure, TextField } from '../shared.js';
import { useAdminText, useFormState } from '../hooks.js';
import { setFailure, usePermissionSet, useSetTitle } from './data.js';

const FORM_ID = 'settings-permission-set-rename';
const NAME_LIMIT = 255;

export default function RenamePermissionSetDialog(): ReactElement {
  const { text } = useAdminText();
  const { setKey = '' } = useParams();
  const api = useApiClient();
  const authz = useAuthorizationClient();
  const toaster = useToaster();
  const title = useSetTitle();
  const { reload } = useOutletContext<{ readonly reload: () => void }>();
  // Loaded afresh, never from the list or the page behind (guideline T3.8).
  const set = usePermissionSet(setKey);
  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(1, text('sets.errors.name'))
          .max(NAME_LIMIT, text('sets.errors.tooLong', { max: NAME_LIMIT })),
      }),
    [text],
  );
  const form = useFormState(schema, { name: '' }, FORM_ID);
  const [seeded, setSeeded] = useState(false);
  if (set.data && !seeded && !set.isFetching) {
    setSeeded(true);
    form.reset({ name: title(set.data) });
  }
  const [rootError, setRootError] = useState<string>();

  async function submit(): Promise<boolean> {
    const values = form.validate();
    if (!values) return false;
    setRootError(undefined);
    try {
      await api.request({
        path: `authorization/permissionSets/${encodeURIComponent(setKey)}`,
        method: 'PATCH',
        json: { title: values.name },
      });
      authz.invalidate();
      toaster.show({
        type: 'success',
        title: text('sets.toasts.saved', { name: values.name }),
      });
      reload();
      return true;
    } catch (caught: unknown) {
      setRootError(setFailure(caught, text));
      return false;
    }
  }

  const blocked = set.error ? (
    <LoadFailure
      error={set.error}
      what={text('sets.whatOne')}
      onRetry={() => void set.refetch()}
    />
  ) : !seeded ? (
    <div
      role='status'
      aria-label={text('common.loading')}
      className='flex flex-col gap-2'
    >
      <Skeleton className='h-4 w-20' />
      <Skeleton className='h-9 w-full' />
    </div>
  ) : undefined;

  return (
    <FormDialog
      title={text('sets.renameTitle')}
      className='sm:max-w-md'
      formId={FORM_ID}
      submitLabel={text('common.save')}
      submit={submit}
      rootError={rootError}
      blocked={blocked}
    >
      <TextField
        formId={FORM_ID}
        name='name'
        label={text('sets.fields.name')}
        required
        maxLength={NAME_LIMIT}
        value={form.values.name}
        onChange={(value) => form.set('name', value)}
        error={form.errors.name}
      />
      <p className='text-sm text-muted-foreground'>
        {text('sets.fields.key')}:{' '}
        <code className='font-mono text-xs'>{setKey}</code>
      </p>
    </FormDialog>
  );
}
