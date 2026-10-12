import type { ManagedUser } from '@nocobase/app-plugin-users/client/user-client';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useOutletContext } from 'react-router';

import { LoadFailure, FieldsSkeleton } from '../shared.js';
import { useAdminText } from '../hooks.js';
import type { UsersOutletContext } from './data.js';

/**
 * What a user overlay shows instead of its form until the user has loaded afresh: a skeleton, the failure, or — when
 * the user no longer exists, found missing on opening or by a save answering 404 — that, with the list refreshed and
 * only the way back offered (guideline R3). `blocked` is undefined once the user is there.
 */
export function useUserBlock(
  user: ManagedUser | null | undefined,
  error: unknown,
  retry: () => void,
): {
  readonly blocked: ReactNode | undefined;
  /** The close button's label: back to the list once the user is known to be gone. */
  readonly closeLabel: string | undefined;
  /** A save answered 404: the user was deleted meanwhile. */
  readonly markGone: () => void;
} {
  const { text } = useAdminText();
  const { reload } = useOutletContext<UsersOutletContext>();
  const [deleted, setDeleted] = useState(false);
  const gone = user === null || deleted;
  useEffect(() => {
    if (user === null) reload();
  }, [user, reload]);
  const markGone = useCallback(() => {
    setDeleted(true);
    reload();
  }, [reload]);
  const blocked = gone ? (
    <LoadFailure error={undefined} notFound what={text('users.what')} />
  ) : error ? (
    <LoadFailure error={error} what={text('users.what')} onRetry={retry} />
  ) : user === undefined ? (
    <FieldsSkeleton />
  ) : undefined;
  return {
    blocked,
    closeLabel: gone ? text('common.backToList') : undefined,
    markGone,
  };
}
