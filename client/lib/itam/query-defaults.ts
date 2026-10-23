import { ApiClientError } from '@nocobase/app-client';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Whether a failed query is asked again (2026-10-23): once, unless the
 * server answered that the request itself is wrong — a record that does not
 * exist, a page the reader may not see — which asking again cannot change.
 * The routes' own cache retried everything three times, so a missing
 * record showed its loading placeholder for seconds before saying so.
 */
export function retryQuery(failureCount: number, error: unknown): boolean {
  if (
    error instanceof ApiClientError &&
    error.status >= 400 &&
    error.status < 500
  )
    return false;
  return failureCount < 1;
}

/**
 * Puts the retry rule on the query cache the pages read. The framework
 * mounts that cache itself, innermost around the routes (`AppClientProviders`
 * in `@nocobase/app-client`), with its own defaults, so `QueryProvider`'s
 * cache never reached them. Called from the layout, which renders inside
 * it, during render so the pages' first queries already follow it.
 */
export function useItamQueryDefaults(): void {
  const client = useQueryClient();
  const defaults = client.getDefaultOptions();
  if (defaults.queries?.retry !== retryQuery)
    client.setDefaultOptions({
      ...defaults,
      queries: { ...defaults.queries, retry: retryQuery },
    });
}
