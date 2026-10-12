import type { UserRoleScopeOption } from '@nocobase/app-plugin-users/client/user-client';
import { AlertCircleIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import { Alert, AlertAction, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Checkbox } from '#components/ui/checkbox';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '#components/ui/field';
import { Skeleton } from '#components/ui/skeleton';

import { useAdminText } from '../hooks.js';
import { useRoleLabel, useRoleScope } from './data.js';

/**
 * The roles as checkboxes. A role not offered for assignment is listed only while the user holds it; a held one
 * that may not be removed stays checked, disabled, with why. Loading shows a skeleton, a failure an Alert with Retry.
 */
export function RoleChecks({
  formId,
  value,
  initial = [],
  onChange,
  error,
  required,
}: {
  readonly formId: string;
  readonly value: readonly string[];
  /** The roles the user held when the form opened. */
  readonly initial?: readonly string[];
  readonly onChange: (value: string[]) => void;
  readonly error?: string;
  readonly required?: boolean;
}): ReactElement {
  const { text } = useAdminText();
  const roleLabel = useRoleLabel();
  const { scope, isLoading, error: loadError, retry } = useRoleScope();
  if (loadError) {
    return (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {text('common.loadFailed', { what: text('users.fields.roles') })}
        </AlertDescription>
        <AlertAction>
          <Button type='button' variant='outline' size='sm' onClick={retry}>
            {text('common.retry')}
          </Button>
        </AlertAction>
      </Alert>
    );
  }
  if (isLoading || !scope) {
    return (
      <div
        role='status'
        aria-label={text('common.loading')}
        className='flex flex-col gap-2'
      >
        <Skeleton className='h-4 w-24' />
        <Skeleton className='h-5 w-48' />
        <Skeleton className='h-5 w-40' />
      </div>
    );
  }
  const options = visibleOptions(scope, initial);
  return (
    <FieldSet data-invalid={error ? true : undefined}>
      <FieldLegend variant='label'>
        {text('users.fields.roles')}
        {required ? (
          <span aria-hidden='true' className='text-destructive'>
            *
          </span>
        ) : null}
      </FieldLegend>
      {scope.hasAuthenticatedDefaultAccess ? (
        <FieldDescription>{text('users.hints.rolesDefault')}</FieldDescription>
      ) : null}
      <div className='flex flex-col gap-2'>
        {options.map((option, index) => {
          const checked = value.includes(option.value);
          const locked =
            (checked &&
              option.removable === false &&
              initial.includes(option.value)) ||
            (!checked && option.assignable === false);
          const id =
            index === 0 ? `${formId}-roles` : `${formId}-roles-${option.value}`;
          return (
            <Field key={option.value} orientation='horizontal'>
              <Checkbox
                id={id}
                checked={checked}
                disabled={locked}
                aria-invalid={error ? true : undefined}
                onCheckedChange={(on) =>
                  onChange(
                    on
                      ? [...value, option.value]
                      : value.filter((item) => item !== option.value),
                  )
                }
              />
              <FieldLabel htmlFor={id} className='font-normal'>
                {roleLabel(option)}
                {locked && checked ? (
                  <span className='text-muted-foreground'>
                    {' · '}
                    {text('users.managedRole')}
                  </span>
                ) : null}
              </FieldLabel>
            </Field>
          );
        })}
      </div>
      <FieldError>{error}</FieldError>
    </FieldSet>
  );
}

function visibleOptions(
  scope: UserRoleScopeOption,
  initial: readonly string[],
): UserRoleScopeOption['options'] {
  return scope.options.filter(
    (option) => option.assignable !== false || initial.includes(option.value),
  );
}
