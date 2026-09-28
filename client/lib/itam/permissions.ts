import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useQuery } from '@tanstack/react-query';

import { useApi } from './api.js';

/**
 * Which actions the signed-in user holds on a collection. Database grants
 * carry policies and are absent from the client permission snapshot, so the
 * server answers. Buttons hide when a grant is missing; every request is
 * still authorized on its own.
 */
export function useCollectionPermissions(
  collection: string,
  actions: readonly string[],
): Readonly<Record<string, boolean>> {
  const api = useApi();
  const query = useQuery({
    queryKey: ['itam', 'permissions', collection, actions],
    queryFn: async () =>
      (
        await api.request<{ data: Record<string, boolean> }>({
          path: 'itam/settings/permissions',
          query: { collection, actions: actions.join(',') },
        })
      ).data,
    staleTime: 60_000,
  });
  return query.data ?? {};
}

/**
 * The signed-in user's id, for "mine" decisions in the UI (the server
 * re-checks). Read from the authentication session: no plugin in this
 * application implements Refine's `getIdentity`, so `useGetIdentity` answers
 * undefined and every "is this me?" silently said no.
 */
export function useCurrentUserId(): string | undefined {
  const { session } = useAuthentication();
  return session?.user?.id === undefined ? undefined : String(session.user.id);
}
