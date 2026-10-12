// New permission set (/settings/permission-sets/new): a name and a key,
// created with no grants; its page opens next, on its permissions.
import { useAuthorizationClient } from '@nocobase/app-plugin-authorization/client';
import { useToaster } from '@nocobase/app-client';
import { useMemo, useState, type ReactElement } from 'react';
import { useLocation, useNavigate, useOutletContext } from 'react-router';
import { z } from 'zod';

import { FormDialog, TextField } from '../shared.js';
import { errorStatus, useAdminText, useFormState } from '../hooks.js';
import { setFailure, type PermissionSetsOutletContext } from './data.js';

const FORM_ID = 'settings-permission-set-new';
const KEY_LIMIT = 64;
const NAME_LIMIT = 255;
// The list's own child routes; a set by one of these keys could not be opened.
const RESERVED = ['new', 'edit'];

/** A key from a name while the key has not been typed: lowercase letters, digits and hyphens. */
function keyFrom(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, KEY_LIMIT);
}

export default function NewPermissionSetDialog(): ReactElement {
  const { text } = useAdminText();
  const authz = useAuthorizationClient();
  const toaster = useToaster();
  const navigate = useNavigate();
  const location = useLocation();
  const { reload } = useOutletContext<PermissionSetsOutletContext>();
  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(1, text('sets.errors.name'))
          .max(NAME_LIMIT, text('sets.errors.tooLong', { max: NAME_LIMIT })),
        key: z
          .string()
          .trim()
          .regex(/^[a-z0-9][a-z0-9-]*$/u, text('sets.errors.key'))
          .max(KEY_LIMIT, text('sets.errors.tooLong', { max: KEY_LIMIT }))
          .refine(
            (key) => !RESERVED.includes(key),
            text('sets.errors.keyTaken'),
          ),
      }),
    [text],
  );
  const form = useFormState(schema, { name: '', key: '' }, FORM_ID);
  const [keyTyped, setKeyTyped] = useState(false);
  const [rootError, setRootError] = useState<string>();

  async function submit(): Promise<boolean> {
    const values = form.validate();
    if (!values) return false;
    setRootError(undefined);
    try {
      const created = await authz.createPermissionSet({
        key: values.key,
        title: values.name,
        grants: [],
      });
      toaster.show({
        type: 'success',
        title: text('sets.toasts.created', { name: values.name }),
      });
      reload();
      // Replaces the dialog's own entry: back from the set returns to the list.
      void navigate(
        {
          pathname: `../${encodeURIComponent(created.key)}/permissions`,
          search: location.search,
        },
        { relative: 'path', replace: true },
      );
      return false;
    } catch (caught: unknown) {
      if (errorStatus(caught) === 409)
        form.setError('key', text('sets.errors.keyTaken'));
      else setRootError(setFailure(caught, text));
      return false;
    }
  }

  return (
    <FormDialog
      title={text('sets.new')}
      className='sm:max-w-md'
      formId={FORM_ID}
      submitLabel={text('common.create')}
      submit={submit}
      rootError={rootError}
    >
      <TextField
        formId={FORM_ID}
        name='name'
        label={text('sets.fields.name')}
        required
        maxLength={NAME_LIMIT}
        value={form.values.name}
        onChange={(value) => {
          form.patch(
            keyTyped ? { name: value } : { name: value, key: keyFrom(value) },
          );
        }}
        error={form.errors.name}
      />
      <TextField
        formId={FORM_ID}
        name='key'
        label={text('sets.fields.key')}
        hint={text('sets.fields.keyHint')}
        required
        maxLength={KEY_LIMIT}
        value={form.values.key}
        onChange={(value) => {
          setKeyTyped(true);
          form.set('key', value);
        }}
        error={form.errors.key}
      />
    </FormDialog>
  );
}
