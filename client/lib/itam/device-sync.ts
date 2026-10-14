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

export type DeviceSourceKey = 'intune' | 'jamf';

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
): UseQueryResult<{
  data: ManagedDevice[];
  connected: boolean;
  checks: DeviceCheck[];
}> {
  const api = useApi();
  return useQuery({
    queryKey: ['itam', DEVICES_PATH, 'managed', deviceId],
    queryFn: () =>
      api.request<{
        data: ManagedDevice[];
        connected: boolean;
        checks: DeviceCheck[];
      }>({
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

/** Device sync, step 2 (2026-10-15): where the platforms and the register disagree. */
export type CheckKind = 'stale' | 'userMismatch' | 'statusMismatch';

export interface DeviceCheck {
  readonly kind: CheckKind;
  readonly critical: boolean;
  readonly deviceId: string;
  readonly deviceNo: string | null;
  readonly deviceName: string | null;
  readonly status: string;
  readonly ownerId: string | null;
  readonly assigneeType: string | null;
  readonly assigneeId: string | null;
  readonly managedDeviceId: string;
  readonly source: DeviceSourceKey;
  readonly lastSyncAt: string | null;
  readonly goneAt: string | null;
  readonly personId: string | null;
  readonly userName: string | null;
}

/** A platform record no register device answers to. */
export interface UnregisteredDevice {
  readonly id: string;
  readonly source: DeviceSourceKey;
  readonly externalId: string;
  readonly serialNo: string | null;
  readonly deviceName: string | null;
  readonly manufacturer: string | null;
  readonly model: string | null;
  readonly osName: string | null;
  readonly osVersion: string | null;
  readonly personId: string | null;
  readonly userName: string | null;
  readonly ownership: string;
  readonly lastSyncAt: string | null;
  readonly matchState: 'unlinked' | 'ambiguous' | 'ignored';
  readonly suggestedModelId: string | null;
  readonly suggestedCategoryId: string | null;
  readonly suggestedManufacturerId: string | null;
  readonly candidates: readonly {
    readonly id: string;
    readonly label: string;
  }[];
  readonly ignoredById: string | null;
  readonly ignoredAt: string | null;
  readonly ignoreReason: string | null;
  readonly consoleUrl: string | null;
  /** Every platform that reports it; a co-managed Mac is one row. */
  readonly sources: readonly DeviceSourceKey[];
}

/** A register device in use that no platform reports. */
export interface UnmanagedDevice {
  readonly id: string;
  readonly deviceNo: string | null;
  readonly name: string | null;
  readonly categoryId: string | null;
  readonly ownerId: string | null;
  readonly assigneeType: string | null;
  readonly assigneeId: string | null;
}

export const REVIEW_VIEWS = [
  'checks',
  'unregistered',
  'unmanaged',
  'ignored',
] as const;
export type ReviewView = (typeof REVIEW_VIEWS)[number];

type ReviewRow<V extends ReviewView> = V extends 'checks'
  ? DeviceCheck
  : V extends 'unmanaged'
    ? UnmanagedDevice
    : UnregisteredDevice;

/** One view of 管理平台核对. */
export function useDeviceReview<V extends ReviewView>(
  view: V,
): UseQueryResult<ReviewRow<V>[]> {
  const api = useApi();
  return useQuery({
    queryKey: ['itam', DEVICE_SYNC_PATH, 'review', view],
    queryFn: async () =>
      (
        await api.request<{ data: ReviewRow<V>[] }>({
          path: `${DEVICE_SYNC_PATH}/review`,
          query: { view },
        })
      ).data,
  });
}

/**
 * A decision about a platform record or a difference: link, unlink, keep
 * off the register, take back, or 以台账为准. Everything under `['itam']`
 * is read again, since the board, 需要关注 and the device pages all show it.
 */
export function useDeviceReviewAction() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      action:
        | { kind: 'link'; managedId: string; deviceId: string }
        | { kind: 'unlink'; managedId: string }
        | { kind: 'ignore'; managedId: string; reason: string }
        | { kind: 'restore'; managedId: string }
        | { kind: 'dismiss'; deviceId: string; check: CheckKind },
    ) => {
      if (action.kind === 'dismiss')
        return api.request({
          path: `${DEVICE_SYNC_PATH}/checks/${action.deviceId}/dismiss`,
          method: 'POST',
          json: { kind: action.check },
        });
      return api.request({
        path: `${DEVICE_SYNC_PATH}/devices/${action.managedId}/${action.kind}`,
        method: 'POST',
        json:
          action.kind === 'link'
            ? { deviceId: action.deviceId }
            : action.kind === 'ignore'
              ? { reason: action.reason }
              : {},
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['itam'] }),
  });
}

/** A leaver's device a platform still heard from after they left. */
export interface OnlineAfterLeaving {
  readonly id: string;
  readonly source: DeviceSourceKey;
  readonly deviceId: string | null;
  readonly deviceName: string | null;
  readonly serialNo: string | null;
  readonly lastSyncAt: string | null;
}

/** For a leaver's 归属 tab; empty unless they have left. */
export function useOnlineAfterLeaving(
  personId: string,
  enabled: boolean,
): UseQueryResult<OnlineAfterLeaving[]> {
  const api = useApi();
  return useQuery({
    queryKey: ['itam', DEVICE_SYNC_PATH, 'online', personId],
    queryFn: async () =>
      (
        await api.request<{ data: OnlineAfterLeaving[] }>({
          path: `${DEVICE_SYNC_PATH}/people/${personId}/online`,
        })
      ).data,
    enabled,
  });
}
