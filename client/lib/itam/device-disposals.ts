import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useApi, type ItamRecord } from '@/lib/itam/api';
import { DISPOSALS_PATH } from '@/lib/itam/operations';

/** Every disposal a device has been listed on, newest first. */
export function useDeviceDisposals(
  deviceId: string,
  enabled = true,
): UseQueryResult<ItamRecord[]> {
  const api = useApi();
  return useQuery({
    queryKey: ['itam', DISPOSALS_PATH, 'for-device', deviceId],
    queryFn: async () =>
      (
        await api.request<{ data: ItamRecord[] }>({
          path: `${DISPOSALS_PATH}/for-device/${deviceId}`,
        })
      ).data,
    enabled: Boolean(deviceId) && enabled,
  });
}
