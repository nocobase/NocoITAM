import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useApi, type ItamRecord } from './api.js';

export const DEVICES_PATH = 'itam/devices';

export type DeviceOperation =
  | 'assign'
  | 'loan'
  | 'return'
  | 'transfer'
  | 'reserve'
  | 'unreserve'
  | 'mark-lost'
  | 'restore'
  | 'retire'
  | 'reactivate'
  | 'correct-status';

/** Runs one lifecycle operation; invalidates device queries on success. */
export function useDeviceOperation() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      operation,
      body,
    }: {
      id: string;
      operation: DeviceOperation;
      body?: Record<string, unknown>;
    }) =>
      (
        await api.request<{ data: ItamRecord }>({
          path: `${DEVICES_PATH}/${id}/${operation}`,
          method: 'POST',
          json: body ?? {},
        })
      ).data,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['itam', DEVICES_PATH] }),
  });
}
