import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { masterDataPath, useApi, type ItamRecord } from '@/lib/itam/api';

/** What `GET /itam/master/people/:id/holdings` returns. */
export interface PersonHoldings {
  readonly devices: readonly ItamRecord[];
  readonly stock: readonly ItamRecord[];
  readonly entitlementSeats: readonly ItamRecord[];
}

export function usePersonHoldings(
  id: string | undefined,
): UseQueryResult<PersonHoldings> {
  const api = useApi();
  return useQuery({
    queryKey: ['itam', masterDataPath('people'), 'holdings', id],
    queryFn: async () =>
      (
        await api.request<{ data: PersonHoldings }>({
          path: `${masterDataPath('people')}/${id}/holdings`,
        })
      ).data,
    enabled: Boolean(id),
  });
}
