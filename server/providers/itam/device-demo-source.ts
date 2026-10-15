import type { DatabaseManager } from '@nocobase/db';

import type {
  DeviceSource,
  DeviceSourceKey,
  ObservedDevice,
} from './device-sources.js';

/**
 * The demo's platforms (2026-10-15). A demo is shown as if Intune and Jamf
 * were connected, so a platform no connection names but whose records the
 * demo wrote reads as connected — 演示 on 设置 → MDM — and 立即同步 or the
 * nightly run pulls from this source instead of the network: the demo's own
 * records as they stand, their last syncs moved on by the time since the
 * previous pull, so a device that synced daily still does and one silent
 * for weeks stays silent. A record the platform stopped reporting is not
 * replayed, so it stays gone. A real connection replaces it.
 */

/** The platform ids the demo gives its records (`demo.ts`). */
export const isDemoExternalId = (externalId: string): boolean =>
  externalId.startsWith('demo-') || externalId.includes(':demo-');

/** The platforms whose records include the demo's. */
export async function demoPlatforms(
  database: DatabaseManager,
): Promise<Set<DeviceSourceKey>> {
  const rows = await database
    .query()
    .selectFrom('managedDevices')
    .select(['source', 'externalId'])
    .where((eb) =>
      eb.or([
        eb('externalId', 'like', 'demo-%'),
        eb('externalId', 'like', '%:demo-%'),
      ]),
    )
    .execute<{ source: string; externalId: string }>();
  return new Set(
    rows
      .filter((row) => isDemoExternalId(row.externalId))
      .map((row) => row.source as DeviceSourceKey),
  );
}

const text = (value: unknown): string | null =>
  typeof value === 'string' && value ? value : null;

const instant = (value: unknown): number | null => {
  if (value instanceof Date) return value.getTime();
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isNaN(parsed) ? null : parsed;
};

const asIso = (value: unknown): string | null => {
  const time = instant(value);
  return time === null ? null : new Date(time).toISOString();
};

export function createDemoSource(
  database: DatabaseManager,
  key: DeviceSourceKey,
  now: () => Date = () => new Date(),
): DeviceSource {
  return {
    key,
    async *pages() {
      const previous = await database
        .query()
        .selectFrom('deviceSyncRuns')
        .select('startedAt')
        .where('source', '=', key)
        .orderBy('startedAt', 'desc')
        .limit(1)
        .executeTakeFirst<{ startedAt: unknown }>();
      const at = now().getTime();
      const elapsed = Math.max(0, at - (instant(previous?.startedAt) ?? at));
      const rows = await database
        .query()
        .selectFrom('managedDevices')
        .selectAll()
        .where('source', '=', key)
        .where('goneAt', 'is', null)
        .execute<Record<string, unknown>>();
      const moved = (value: unknown): string | null => {
        const time = instant(value);
        return time === null
          ? null
          : new Date(Math.min(time + elapsed, at)).toISOString();
      };
      yield rows
        .filter((row) => isDemoExternalId(String(row.externalId)))
        .map((row): ObservedDevice => ({
          externalId: String(row.externalId),
          serialNo: text(row.serialNo),
          deviceName: text(row.deviceName),
          manufacturer: text(row.manufacturer),
          model: text(row.model),
          osName: text(row.osName),
          osVersion: text(row.osVersion),
          userPrincipal: text(row.userPrincipal),
          userName: text(row.userName),
          ownership:
            row.ownership === 'company' || row.ownership === 'personal'
              ? row.ownership
              : 'unknown',
          compliance: text(row.compliance),
          encrypted:
            row.encrypted === null || row.encrypted === undefined
              ? null
              : Boolean(row.encrypted),
          wifiMac: text(row.wifiMac),
          enrolledAt: asIso(row.enrolledAt),
          lastSyncAt: moved(row.lastSyncAt),
          raw:
            typeof row.raw === 'string'
              ? (JSON.parse(row.raw) as Record<string, unknown>)
              : ((row.raw ?? {}) as Record<string, unknown>),
        }));
    },
  };
}
