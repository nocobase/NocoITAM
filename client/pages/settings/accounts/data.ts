// The data ITAM's additions to the prepared Users page share
// (user-extras.tsx): the users plugin's typed client, its role scope (the
// permission sets the authorization plugin offers as roles) and one user
// loaded afresh.
import { useApiClient } from '@nocobase/app-client';
import {
  UsersClient,
  type ManagedUser,
  type UserRoleOption,
  type UserRoleScopeOption,
} from '@nocobase/app-plugin-users/client/user-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import {
  errorFields,
  errorReason,
  errorStatus,
  useAdminQueryKey,
} from '../common/hooks.js';

export function useUsersKey(): readonly string[] {
  const base = useAdminQueryKey();
  return useMemo(() => [...base, 'users'], [base]);
}

export interface UsersOutletContext {
  /** Refetches the list (and the invitations) behind the overlay. */
  readonly reload: () => void;
}

export function useUsersClient(): UsersClient {
  const api = useApiClient();
  return useMemo(() => new UsersClient(api), [api]);
}

/** The role scope users are given roles in: the first the plugin offers. */
export function useRoleScope(): {
  readonly scope: UserRoleScopeOption | undefined;
  readonly isLoading: boolean;
  readonly error: unknown;
  readonly retry: () => void;
} {
  const client = useUsersClient();
  const usersKey = useUsersKey();
  const query = useQuery({
    queryKey: [...usersKey, 'options'],
    queryFn: () => client.options(),
    staleTime: 60_000,
    retry: false,
  });
  return {
    scope: query.data?.roleScopes[0],
    isLoading: query.isLoading,
    error: query.error,
    retry: () => void query.refetch(),
  };
}

/** A role's label in the current language, through the key its scope registered. */
export function useRoleLabel(): (option: UserRoleOption) => string {
  const { t } = useTranslation();
  return useCallback(
    (option) =>
      option.labelI18nKey
        ? t(option.labelI18nKey, {
            ns: option.labelI18nNs,
            defaultValue: option.label,
          })
        : option.label,
    [t],
  );
}

/**
 * One user, loaded afresh for an overlay (guideline T3.8): the plugin has no read of one user, so the pages of the
 * list are read until the id turns up. Only IT signs in, a team's worth of accounts; at 100 a page this is a request or
 * two. A user not found answers null, which the overlay shows as a record that no longer exists.
 */
export function useUser(userId: string): {
  readonly user: ManagedUser | null | undefined;
  readonly error: unknown;
  readonly retry: () => void;
} {
  const client = useUsersClient();
  const usersKey = useUsersKey();
  const query = useQuery({
    queryKey: [...usersKey, 'one', userId],
    queryFn: async (): Promise<ManagedUser | null> => {
      for (let page = 1; ; page += 1) {
        const result = await client.list({ page, pageSize: 100 });
        const found = result.items.find((item) => item.id === userId);
        if (found) return found;
        if (page * result.pageSize >= result.total) return null;
      }
    },
    // An overlay always starts from what the server holds now.
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  return {
    user: query.data,
    error: query.error,
    retry: () => void query.refetch(),
  };
}

/**
 * Where a failed user write is told: a conflict or an invalid field under its field, the last-administrator rule
 * and anything else as one sentence at the top of the dialog (never the server's own message).
 */
export function userFailure(
  error: unknown,
  text: (key: string) => string,
  setError: (field: string, message: string) => void,
  fields: readonly string[],
): string | undefined {
  const reason = errorReason(error);
  if (reason === 'USER_EMAIL_CONFLICT' && fields.includes('email')) {
    setError('email', text('users.errors.emailTaken'));
    return undefined;
  }
  if (reason?.includes('USERNAME') && fields.includes('username')) {
    setError('username', text('users.errors.usernameTaken'));
    return undefined;
  }
  if (reason === 'LAST_ASSIGNMENT')
    return text('users.errors.lastAdministrator');
  const invalid = errorFields(error).find((field) => fields.includes(field));
  if (invalid) {
    setError(
      invalid,
      text(
        invalid === 'email'
          ? 'users.errors.emailFormat'
          : invalid === 'password'
            ? 'users.errors.password'
            : invalid === 'username'
              ? 'users.errors.username'
              : 'users.errors.name',
      ),
    );
    return undefined;
  }
  const status = errorStatus(error);
  if (status === 404) return text('common.notFound');
  if (status === 0) return text('common.network');
  if (status === 401) return text('common.sessionEnded');
  return text('common.failed');
}
