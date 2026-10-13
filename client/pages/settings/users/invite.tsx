// Invite users (/settings/users/invite): addresses and the roles they will
// hold. Each address is answered on its own: invited (with its link to copy
// when no email could be sent, which the plugin returns only now), or
// already an account. The link is never shown again, so the results stay in
// the dialog until Done.
import {
  isEmailAddress,
  parseEmailList,
  type UserInvitationResult,
} from '@nocobase/app-plugin-users/client/user-client';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type ReactElement } from 'react';
import { z } from 'zod';

import { ToneBadge as Badge } from '@/components/settings/tone-badge';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '#components/ui/field';
import { Textarea } from '#components/ui/textarea';

import { CopyField, FormDialog } from '../shared.js';
import { useAdminText, useFormState } from '../hooks.js';
import {
  useRoleScope,
  useUsersKey,
  userFailure,
  useUsersClient,
} from './data.js';
import { RoleChecks } from './role-checks.js';

const FORM_ID = 'settings-user-invite';
const MAX_ADDRESSES = 50;

export default function InviteUsersDialog(): ReactElement {
  const { text } = useAdminText();
  const client = useUsersClient();
  const queryClient = useQueryClient();
  const usersKey = useUsersKey();
  const { scope } = useRoleScope();
  const required = scope?.requiredOnCreate ?? false;
  const schema = useMemo(
    () =>
      z.object({
        emails: z.string().superRefine((value, context) => {
          const list = parseEmailList(value);
          if (list.length === 0)
            context.addIssue({
              code: 'custom',
              message: text('users.errors.emailsRequired'),
            });
          else if (list.length > MAX_ADDRESSES)
            context.addIssue({
              code: 'custom',
              message: text('users.errors.emailsTooMany', {
                max: MAX_ADDRESSES,
              }),
            });
          else {
            const invalid = list.filter((address) => !isEmailAddress(address));
            if (invalid.length > 0)
              context.addIssue({
                code: 'custom',
                message: text('users.errors.emailsInvalid', {
                  list: invalid.join(', '),
                }),
              });
          }
        }),
        roles: z
          .array(z.string())
          .min(required ? 1 : 0, text('users.errors.roles')),
      }),
    [text, required],
  );
  const form = useFormState(schema, { emails: '', roles: [] }, FORM_ID);
  const [rootError, setRootError] = useState<string>();
  const [results, setResults] = useState<UserInvitationResult[]>();

  async function submit(): Promise<boolean> {
    const values = form.validate();
    if (!values) return false;
    setRootError(undefined);
    try {
      const answered = await client.invite({
        emails: parseEmailList(values.emails),
        ...(scope ? { roleScopes: { [scope.key]: values.roles } } : {}),
      });
      setResults(answered);
      void queryClient.invalidateQueries({
        queryKey: [...usersKey, 'invitations'],
      });
    } catch (caught: unknown) {
      setRootError(userFailure(caught, text, form.setError, ['emails']));
    }
    // Stays open: the results, and any link to copy, are shown next.
    return false;
  }

  return (
    <FormDialog
      title={text(
        results ? 'invitations.resultsTitle' : 'users.dialogs.inviteTitle',
      )}
      description={
        results ? undefined : text('users.dialogs.inviteDescription')
      }
      className='sm:max-w-md'
      formId={FORM_ID}
      submitLabel={text('invitations.send')}
      submit={submit}
      // The roles are not offered yet (loading) or could not load (R-5).
      submitDisabled={!scope && !results}
      rootError={rootError}
      blocked={results ? <InviteResults results={results} /> : undefined}
      closeLabel={text('common.done')}
    >
      <Field data-invalid={form.errors.emails ? true : undefined}>
        <FieldLabel htmlFor={`${FORM_ID}-emails`}>
          {text('users.fields.emails')}
          <span aria-hidden='true' className='text-destructive'>
            *
          </span>
        </FieldLabel>
        <Textarea
          id={`${FORM_ID}-emails`}
          rows={4}
          value={form.values.emails}
          aria-required
          aria-invalid={form.errors.emails ? true : undefined}
          onChange={(event) => form.set('emails', event.target.value)}
        />
        {form.errors.emails ? null : (
          <FieldDescription>{text('users.hints.emails')}</FieldDescription>
        )}
        <FieldError>{form.errors.emails}</FieldError>
      </Field>
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

/** One line per address: what became of it, and the link to forward when no email went out. */
export function InviteResults({
  results,
}: {
  readonly results: readonly UserInvitationResult[];
}): ReactElement {
  const { text } = useAdminText();
  return (
    <ul className='flex flex-col gap-3'>
      {results.map((result, index) => (
        <li key={result.email} className='flex flex-col gap-2 text-sm'>
          <span className='flex flex-wrap items-center gap-2'>
            <span className='font-medium break-all'>{result.email}</span>
            <Badge
              variant={
                result.outcome === 'existingUser'
                  ? 'muted'
                  : result.emailSent
                    ? 'success'
                    : 'warning'
              }
            >
              {text(
                result.outcome === 'existingUser'
                  ? 'invitations.existing'
                  : result.emailSent
                    ? 'invitations.sent'
                    : 'invitations.linkOnly',
              )}
            </Badge>
          </span>
          {result.outcome === 'invited' &&
          !result.emailSent &&
          result.inviteUrl ? (
            <CopyField
              id={`invite-link-${index}`}
              value={result.inviteUrl}
              label={text('invitations.copyLink')}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
