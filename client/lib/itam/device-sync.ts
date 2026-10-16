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
  exemption: Exemption | null;
}> {
  const api = useApi();
  return useQuery({
    queryKey: ['itam', DEVICES_PATH, 'managed', deviceId],
    queryFn: () =>
      api.request<{
        data: ManagedDevice[];
        connected: boolean;
        checks: DeviceCheck[];
        exemption: Exemption | null;
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

/**
 * A platform's connection on 设置 → 设备同步 (2026-10-15): from
 * `config.yml` (read-only here) or entered on the page. Never the secret.
 */
export interface DeviceConnection {
  readonly source: DeviceSourceKey;
  /** `demo`: the demo stands in for the platform (2026-10-15). */
  readonly origin: 'config' | 'settings' | 'demo' | null;
  readonly tenantId: string | null;
  readonly url: string | null;
  readonly clientId: string | null;
  readonly updatedAt: string | null;
  readonly updatedById: string | null;
}

export interface DeviceConnectionInput {
  readonly tenantId?: string;
  readonly url?: string;
  readonly clientId?: string;
  /** Left out keeps the secret already stored. */
  readonly clientSecret?: string;
}

export type ConnectionTestResult =
  | { readonly ok: true; readonly devices: number }
  | {
      readonly ok: false;
      readonly failureCode: string;
      readonly failure: string;
    };

const CONNECTIONS_PATH = `${DEVICE_SYNC_PATH}/connections`;

/** The connections, and whether the server can store a secret at all. */
export function useDeviceConnections(): UseQueryResult<{
  secretsReady: boolean;
  connections: DeviceConnection[];
}> {
  const api = useApi();
  return useQuery({
    queryKey: ['itam', DEVICE_SYNC_PATH, 'connections'],
    queryFn: async () =>
      (
        await api.request<{
          data: { secretsReady: boolean; connections: DeviceConnection[] };
        }>({ path: CONNECTIONS_PATH })
      ).data,
  });
}

/** Saves or disconnects a connection; both refresh the whole page. */
export function useDeviceConnectionActions() {
  const api = useApi();
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['itam', DEVICE_SYNC_PATH] });
  const save = useMutation({
    mutationFn: async (input: {
      source: DeviceSourceKey;
      values: DeviceConnectionInput;
    }) =>
      (
        await api.request<{ data: DeviceConnection }>({
          path: `${CONNECTIONS_PATH}/${input.source}`,
          method: 'PUT',
          json: input.values,
        })
      ).data,
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: async (source: DeviceSourceKey) =>
      api.request({ path: `${CONNECTIONS_PATH}/${source}`, method: 'DELETE' }),
    onSuccess: refresh,
  });
  const test = useMutation({
    mutationFn: async (input: {
      source: DeviceSourceKey;
      values: DeviceConnectionInput;
    }) =>
      (
        await api.request<{ data: ConnectionTestResult }>({
          path: `${CONNECTIONS_PATH}/${input.source}/test`,
          method: 'POST',
          json: input.values,
        })
      ).data,
  });
  return { save, remove, test };
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
  /** Among the ignored (2026-10-16): who ignored it, and when. */
  readonly dismissedById?: string | null;
  readonly dismissedAt?: string | null;
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
  /** The primary user's department, for 补登记. */
  readonly suggestedDepartmentId: string | null;
  readonly candidates: readonly {
    readonly id: string;
    readonly label: string;
  }[];
  readonly ignoredById: string | null;
  readonly ignoredAt: string | null;
  readonly ignoreReason: string | null;
  /** Kept off by 核对规则 (a personal device), not by a person. */
  readonly ignoredByRule: boolean;
  readonly consoleUrl: string | null;
  /** Every platform that reports it; a co-managed Mac is one row. */
  readonly sources: readonly DeviceSourceKey[];
}

/** A register device in use that no platform reports. */
export interface UnmanagedDevice {
  readonly id: string;
  readonly deviceNo: string | null;
  readonly name: string | null;
  readonly serialNo: string | null;
  readonly modelId: string | null;
  readonly categoryId: string | null;
  readonly ownerId: string | null;
  readonly assigneeType: string | null;
  readonly assigneeId: string | null;
}

/** 不需要纳管: why a device is rightly on no platform (2026-10-15). */
export interface Exemption {
  readonly reason: string;
  readonly exemptedById: string | null;
  readonly exemptedAt: string | null;
}

export interface ExemptDevice extends UnmanagedDevice, Exemption {}

/** A platform record linked by hand, and its device (2026-10-16). */
export interface LinkedRecord extends UnregisteredDevice {
  readonly linkedDevice: {
    readonly id: string;
    readonly deviceNo: string | null;
    readonly name: string | null;
    readonly serialNo: string | null;
  };
}

export const REVIEW_VIEWS = [
  'checks',
  'unregistered',
  'unmanaged',
  'ignored',
  'exempted',
  'dismissed',
  'linked',
  'silent',
] as const;
export type ReviewView = (typeof REVIEW_VIEWS)[number];

type ReviewRow<V extends ReviewView> = V extends 'checks' | 'dismissed'
  ? DeviceCheck
  : V extends 'unmanaged'
    ? UnmanagedDevice
    : V extends 'exempted'
      ? ExemptDevice
      : V extends 'linked'
        ? LinkedRecord
        : UnregisteredDevice;

/** One view of MDM 核对. */
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
 * off the register, take back, or 忽略 a difference. Everything under `['itam']`
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
        | { kind: 'dismiss'; deviceId: string; check: CheckKind }
        | { kind: 'undismiss'; deviceId: string; check: CheckKind }
        | { kind: 'exempt'; deviceId: string; reason: string }
        | { kind: 'unexempt'; deviceId: string },
    ) => {
      // 不需要纳管 and taking it back (2026-10-15).
      if (action.kind === 'exempt' || action.kind === 'unexempt')
        return api.request({
          path: `${DEVICE_SYNC_PATH}/unmanaged/${action.deviceId}/${action.kind}`,
          method: 'POST',
          json: action.kind === 'exempt' ? { reason: action.reason } : {},
        });
      if (action.kind === 'dismiss' || action.kind === 'undismiss')
        return api.request({
          path: `${DEVICE_SYNC_PATH}/checks/${action.deviceId}/${action.kind}`,
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
