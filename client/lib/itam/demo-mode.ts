import { useQuery } from '@tanstack/react-query';
import { useApi } from './api';

/** Shared public plugin status; no duplicate application mode flag. */
export function useDemoMode() {
  const api = useApi();
  return useQuery({
    queryKey: ['demoMode', 'status'],
    queryFn: async () =>
      (
        await api.request<{ data: { enabled: boolean } }>({
          path: 'demoMode/status',
        })
      ).data.enabled,
    staleTime: Infinity,
  });
}
