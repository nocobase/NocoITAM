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

/**
 * Runs one lifecycle operation; invalidates everything ITAM on success
 * (2026-10-22): a device's state is read beyond its own queries — MDM 核对's
 * lists, behind the record drawer the operation now runs in, the workbench
 * and the reminders — as the record edits do (`useItamMutations`).
 */
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['itam'] }),
  });
}
