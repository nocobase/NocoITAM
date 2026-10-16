import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useApi, type ItamSettings } from '@/lib/itam/api';
import { DEVICE_SYNC_PATH } from '@/lib/itam/device-sync';

type SettingsKey = keyof ItamSettings;

/** Saves one of ITAM's settings documents whole. */
export function useSave<K extends SettingsKey>(key: K) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: ItamSettings[K]) =>
      api.request({ path: `itam/settings/${key}`, method: 'PUT', json: value }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['itam', 'settings'] }),
        // The MDM review lists and counts follow 核对规则 (2026-10-15).
        key === 'deviceSync'
          ? queryClient.invalidateQueries({
              queryKey: ['itam', DEVICE_SYNC_PATH],
            })
          : undefined,
      ]),
  });
}
