import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import { DEVICES_PATH } from './device-api.js';
import { useApi } from './api.js';

/** Device sync (2026-10-14): what the management platforms report. */
export const DEVICE_SYNC_PATH = 'itam/device-sync';

export type DeviceSourceKey = 'intune';

/** One platform's record of a register device. */
export interface ManagedDevice {
  readonly id: string;
  readonly source: DeviceSourceKey;
  readonly externalId: string;
  readonly deviceName: string | null;
  readonly manufacturer: string | null;
  readonly model: string | null;
  readonly osName: string | null;
  readonly osVersion: string | null;
  readonly userPrincipal: string | null;
  readonly userName: string | null;
  readonly personId: string | null;
  readonly ownership: 'company' | 'personal' | 'unknown';
  readonly compliance: string | null;
  readonly encrypted: boolean | null;
  readonly enrolledAt: string | null;
  readonly lastSyncAt: string | null;
  readonly lastSeenAt: string | null;
  readonly goneAt: string | null;
  readonly matchedBy: string | null;
  readonly consoleUrl: string | null;
}

export interface SyncRun {
  readonly id: string;
  readonly source: DeviceSourceKey;
  readonly trigger: 'schedule' | 'manual' | 'demo';
  readonly actorId: string | null;
  readonly status: 'running' | 'succeeded' | 'partial' | 'failed';
  readonly seen: number;
  readonly added: number;
  readonly linked: number;
  readonly gone: number;
  readonly failureCode: string | null;
  readonly failure: string | null;
  readonly startedAt: string;
  readonly finishedAt: string | null;
}

export interface SourceStatus {
  readonly key: DeviceSourceKey;
  readonly configured: boolean;
  readonly running: boolean;
  readonly lastRun: SyncRun | null;
  readonly lastSuccessAt: string | null;
  readonly counts: {
    readonly devices: number;
    readonly linked: number;
    readonly unlinked: number;
    readonly ambiguous: number;
    readonly personal: number;
    readonly gone: number;
  };
}

/**
 * The platforms' records of one device, under the device's own queries so a
 * device change refreshes them. `connected` says whether any platform is
 * there at all.
 */
export function useManagedDevices(
  deviceId: string | undefined,
): UseQueryResult<{ data: ManagedDevice[]; connected: boolean }> {
  const api = useApi();
  return useQuery({
    queryKey: ['itam', DEVICES_PATH, 'managed', deviceId],
    queryFn: () =>
      api.request<{ data: ManagedDevice[]; connected: boolean }>({
        path: `${DEVICES_PATH}/${deviceId}/managed`,
      }),
    enabled: Boolean(deviceId),
  });
}

/** Each source on 设置 → 设备同步, asked again every 2 s while one pulls. */
export function useDeviceSyncStatus(): UseQueryResult<SourceStatus[]> {
  const api = useApi();
  return useQuery({
    queryKey: ['itam', DEVICE_SYNC_PATH],
    queryFn: async () =>
      (await api.request<{ data: SourceStatus[] }>({ path: DEVICE_SYNC_PATH }))
        .data,
    refetchInterval: (query) =>
      query.state.data?.some((source) => source.running) ? 2000 : false,
  });
}

/** Starts a pull of every configured source. */
export function useStartDeviceSync() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (
        await api.request<{ data: SyncRun[] }>({
          path: `${DEVICE_SYNC_PATH}/run`,
          method: 'POST',
          json: {},
        })
      ).data,
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ['itam', DEVICE_SYNC_PATH] }),
  });
}
