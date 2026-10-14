import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { Row } from './collection-query.js';
import { dbDateTime } from './dates.js';
import type { JamfSourceConfig } from '../../config/device-sync.js';
import {
  DEVICE_SOURCES,
  SourceError,
  consoleUrl,
  normalizeSerial,
  type DeviceSource,
  type DeviceSourceKey,
  type ObservedDevice,
  type SourceFailureCode,
} from './device-sources.js';
import type { HistoryService } from './history.js';

/**
 * Device sync, step 1 (2026-10-14): pulls each configured device management
 * platform's devices into `managedDevices` and links each to the register
 * device of the same serial. A sync never writes the register: the only
 * thing it adds to a device is the `managedLinked` line on its timeline.
 */

/** What started a pull. */
export type SyncTrigger = 'schedule' | 'manual' | 'demo';

/**
 * How a pull stands or ended. `partial` stopped after some pages, so it
 * updated what it read and marked nothing gone.
 */
export type SyncRunStatus = 'running' | 'succeeded' | 'partial' | 'failed';

export type MatchState = 'linked' | 'unlinked' | 'ambiguous' | 'ignored';

/** One source on the settings page. */
export interface SourceStatus {
  readonly key: DeviceSourceKey;
  /** Whether `config.yml` connects it. */
  readonly configured: boolean;
  readonly running: boolean;
  /** The latest pull, finished or not. */
  readonly lastRun: Row | null;
  /** The latest pull that read everything. */
  readonly lastSuccessAt: string | null;
  readonly counts: {
    /** Still reported by the platform. */
    readonly devices: number;
    readonly linked: number;
    readonly unlinked: number;
    readonly ambiguous: number;
    readonly personal: number;
    /** No longer reported. */
    readonly gone: number;
  };
}

/** What a device's page shows about one platform's record of it. */
export interface ManagedDeviceView {
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
  readonly ownership: string;
  readonly compliance: string | null;
  readonly encrypted: boolean | null;
  readonly enrolledAt: string | null;
  readonly lastSyncAt: string | null;
  readonly lastSeenAt: string | null;
  readonly goneAt: string | null;
  readonly matchedBy: string | null;
  /** Where the record opens on the platform. */
  readonly consoleUrl: string | null;
}

export interface DeviceSyncService {
  /** Each known source, whether configured or not, with its counts. */
  status(): Promise<SourceStatus[]>;
  /**
   * Starts a pull of every configured source not already being pulled and
   * returns their runs at once; the pulls carry on in the background.
   */
  start(trigger: SyncTrigger, actorId?: string): Promise<Row[]>;
  /** Pulls every configured source and waits for the end: the schedule's. */
  runAll(trigger: SyncTrigger, actorId?: string): Promise<Row[]>;
  /**
   * Reads one source's pages into `managedDevices` as one run. What a pull
   * and the demo both go through, so demo data meets the same matching.
   */
  ingest(
    source: DeviceSourceKey,
    pages: AsyncIterable<readonly ObservedDevice[]>,
    trigger: SyncTrigger,
    actorId?: string,
  ): Promise<Row>;
  /** The platforms' records of one register device. */
  forDevice(deviceId: string): Promise<ManagedDeviceView[]>;
  /**
   * Whether any platform is connected or has ever reported a device: a
   * device page says "not found on the platforms" only then.
   */
  connected(): Promise<boolean>;
  /** Where the platform's own page for one of its records is. */
  consoleUrlOf(source: string, externalId: string): string | null;
  /**
   * Links a device just put on the register to the platform record of its
   * serial, the way the next pull would (step 2, 2026-10-15) — so 补登记
   * shows the platform at once. A person's own decision on a record stands.
   */
  matchDevice(deviceId: string, actorId?: string): Promise<void>;
}

export const deviceSyncServiceToken: ServiceToken<DeviceSyncService> =
  createServiceToken<DeviceSyncService>('itam/device-sync-service');

/** How long a pull's run is kept. */
const RUN_RETENTION_DAYS = 90;

const iso = (value: unknown): string | null => {
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' && value ? value : null;
};

/** A platform timestamp as stored: a Date, or null when unreadable. */
const timestamp = (value: string | null): Date | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export function createDeviceSyncService(deps: {
  readonly database: DatabaseManager;
  readonly history: HistoryService;
  /** The sources `config.yml` connects, read when a pull starts. */
  readonly sources: () => readonly DeviceSource[];
  /** The pages that show live data are told when a pull changed something. */
  readonly touched?: () => void;
  readonly log?: (message: string, error: unknown) => void;
  readonly now?: () => Date;
  /** The platforms' addresses, for links to a record's own page. */
  readonly consoles?: () => { readonly jamf?: JamfSourceConfig } | undefined;
}): DeviceSyncService {
  const { database, history } = deps;
  const now = deps.now ?? (() => new Date());
  /** Pulls under way in this process, by source. */
  const running = new Map<DeviceSourceKey, Promise<Row>>();

  const runRow = async (id: string): Promise<Row> =>
    database
      .query()
      .selectFrom('deviceSyncRuns')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();

  /**
   * The register as matching sees it, read once per pull: device ids by
   * normalized serial, the ids that exist, and people by email.
   */
  const loadRegister = async () => {
    const devices = await database
      .query()
      .selectFrom('devices')
      .select(['id', 'serialNo'])
      .execute<{ id: string; serialNo: string | null }>();
    const bySerial = new Map<string, string[]>();
    for (const device of devices) {
      const serial = normalizeSerial(device.serialNo);
      if (!serial) continue;
      bySerial.set(serial, [...(bySerial.get(serial) ?? []), device.id]);
    }
    const people = await database
      .query()
      .selectFrom('people')
      .select(['id', 'email'])
      .execute<{ id: string; email: string | null }>();
    const byEmail = new Map<string, string[]>();
    for (const person of people) {
      const email = person.email?.trim().toLowerCase();
      if (!email) continue;
      byEmail.set(email, [...(byEmail.get(email) ?? []), person.id]);
    }
    return {
      bySerial,
      exists: new Set(devices.map((device) => device.id)),
      byEmail,
    };
  };
  type Register = Awaited<ReturnType<typeof loadRegister>>;

  const personOf = (register: Register, principal: string | null) => {
    const matches = principal
      ? register.byEmail.get(principal.trim().toLowerCase())
      : undefined;
    return matches?.length === 1 ? matches[0] : null;
  };

  /** Writes one page in one transaction; returns what it counted. */
  const writePage = async (
    source: DeviceSourceKey,
    page: readonly ObservedDevice[],
    register: Register,
    run: {
      readonly id: string;
      readonly actorId: string | null;
      readonly trigger: SyncTrigger;
    },
  ): Promise<{ added: number; linked: number }> => {
    if (page.length === 0) return { added: 0, linked: 0 };
    // A platform can repeat a record across pages; the last copy wins.
    const unique = new Map(page.map((device) => [device.externalId, device]));
    let added = 0;
    let linked = 0;
    await database.transaction(async (connection: DatabaseConnection) => {
      const existing = await connection.query
        .selectFrom('managedDevices')
        .selectAll()
        .where('source', '=', source)
        .where('externalId', 'in', [...unique.keys()])
        .execute();
      const byExternal = new Map(
        existing.map((row) => [String(row.externalId), row]),
      );
      const seenAt = now();
      for (const observed of unique.values()) {
        const serialNo = normalizeSerial(observed.serialNo);
        const fields = {
          serialNo,
          deviceName: observed.deviceName,
          manufacturer: observed.manufacturer,
          model: observed.model,
          osName: observed.osName,
          osVersion: observed.osVersion,
          userPrincipal: observed.userPrincipal,
          userName: observed.userName,
          personId: personOf(register, observed.userPrincipal),
          ownership: observed.ownership,
          compliance: observed.compliance,
          encrypted: observed.encrypted,
          wifiMac: observed.wifiMac,
          enrolledAt: timestamp(observed.enrolledAt),
          lastSyncAt: timestamp(observed.lastSyncAt),
          raw: observed.raw,
          lastSeenAt: seenAt,
          goneAt: null,
          updatedAt: seenAt,
        };
        const row = byExternal.get(observed.externalId);
        // A link follows the platform's id once made; it is redone only when
        // its device has been deleted. An ignored record stays ignored.
        // A person's own link or unlink (`matchedBy: manual`, step 2)
        // stands too, until its device is deleted.
        const keepLink =
          row?.matchState === 'ignored' ||
          (row?.matchState === 'unlinked' && row.matchedBy === 'manual') ||
          (row?.matchState === 'linked' &&
            typeof row.deviceId === 'string' &&
            register.exists.has(row.deviceId));
        const candidates = serialNo
          ? (register.bySerial.get(serialNo) ?? [])
          : [];
        const match = keepLink
          ? {}
          : candidates.length === 1
            ? {
                deviceId: candidates[0],
                matchState: 'linked' as MatchState,
                matchedBy: 'serial',
              }
            : {
                deviceId: null,
                matchState: (candidates.length > 1
                  ? 'ambiguous'
                  : 'unlinked') as MatchState,
                matchedBy: null,
              };
        let id: string;
        if (row) {
          id = String(row.id);
          await connection.query
            .updateTable('managedDevices')
            .set({ ...fields, ...match })
            .where('id', '=', id)
            .execute();
        } else {
          id = crypto.randomUUID();
          added++;
          await connection.query
            .insertInto('managedDevices')
            .values({
              id,
              source,
              externalId: observed.externalId,
              ...fields,
              deviceId: null,
              matchState: 'unlinked',
              matchedBy: null,
              ...match,
              firstSeenAt: seenAt,
              createdAt: seenAt,
            })
            .execute();
        }
        if (
          'matchState' in match &&
          match.matchState === 'linked' &&
          match.deviceId
        ) {
          linked++;
          await history.record(
            {
              subjectType: 'devices',
              subjectId: match.deviceId,
              type: 'managedLinked',
              summary: `Linked to ${source} device ${observed.deviceName ?? observed.externalId} by serial number`,
              payload: {
                source,
                externalId: observed.externalId,
                targetLabel: observed.deviceName ?? observed.externalId,
              },
              origin: 'sync',
              sourceType: 'deviceSyncRuns',
              sourceId: run.id,
              ...(run.actorId ? { actorId: run.actorId } : {}),
            },
            connection,
          );
        }
      }
    });
    return { added, linked };
  };

  const finish = async (
    id: string,
    values: Record<string, unknown>,
  ): Promise<void> => {
    const finishedAt = now();
    await database
      .query()
      .updateTable('deviceSyncRuns')
      .set({ ...values, finishedAt, updatedAt: finishedAt })
      .where('id', '=', id)
      .execute();
  };

  /** Writes a pull's run as `running`; the pull itself comes after. */
  const open = async (
    source: DeviceSourceKey,
    trigger: SyncTrigger,
    actorId?: string,
  ) => {
    const startedAt = now();
    const id = crypto.randomUUID();
    // A run still `running` here was cut off by a restart: this process is
    // the only one that pulls this source.
    await database
      .query()
      .updateTable('deviceSyncRuns')
      .set({
        status: 'failed',
        failureCode: 'INTERRUPTED' satisfies SourceFailureCode,
        failure: 'The application stopped during this sync',
        finishedAt: startedAt,
        updatedAt: startedAt,
      })
      .where('source', '=', source)
      .where('status', '=', 'running')
      .execute();
    await database
      .query()
      .insertInto('deviceSyncRuns')
      .values({
        id,
        source,
        trigger,
        actorId: actorId ?? null,
        status: 'running',
        seen: 0,
        added: 0,
        linked: 0,
        gone: 0,
        failureCode: null,
        failure: null,
        startedAt,
        finishedAt: null,
        createdAt: startedAt,
        updatedAt: startedAt,
      })
      .execute();
    return { id, actorId: actorId ?? null, trigger, startedAt };
  };

  /** Reads the pages into an open run and closes it. */
  const pull = async (
    source: DeviceSourceKey,
    run: Awaited<ReturnType<typeof open>>,
    pages: AsyncIterable<readonly ObservedDevice[]>,
  ): Promise<Row> => {
    const { id, startedAt } = run;
    let seen = 0;
    let added = 0;
    let linked = 0;
    let pagesRead = 0;
    try {
      const register = await loadRegister();
      for await (const page of pages) {
        const counted = await writePage(source, page, register, run);
        seen += page.length;
        added += counted.added;
        linked += counted.linked;
        pagesRead++;
      }
      // Only a pull that read everything may say what is gone: a record it
      // did not see this time was not returned at all.
      const gone = await database
        .query()
        .updateTable('managedDevices')
        .set({ goneAt: now(), updatedAt: now() })
        .where('source', '=', source)
        .where('goneAt', 'is', null)
        .where('lastSeenAt', '<', dbDateTime(startedAt))
        .execute();
      await finish(id, {
        status: 'succeeded',
        seen,
        added,
        linked,
        gone: gone.updatedCount ?? 0,
      });
    } catch (error) {
      const code: SourceFailureCode =
        error instanceof SourceError ? error.code : 'UNAVAILABLE';
      deps.log?.(`Device sync from ${source} failed`, error);
      await finish(id, {
        status: pagesRead > 0 ? 'partial' : 'failed',
        seen,
        added,
        linked,
        failureCode: code,
        failure: error instanceof Error ? error.message : String(error),
      });
    }
    await database
      .query()
      .deleteFrom('deviceSyncRuns')
      .where(
        'startedAt',
        '<',
        dbDateTime(
          new Date(startedAt.getTime() - RUN_RETENTION_DAYS * 86_400_000),
        ),
      )
      .execute();
    if (seen > 0) deps.touched?.();
    return runRow(id);
  };

  const ingest: DeviceSyncService['ingest'] = async (
    source,
    pages,
    trigger,
    actorId,
  ) => pull(source, await open(source, trigger, actorId), pages);

  /**
   * Opens a pull of one source unless one is under way, and answers with
   * its run's id at once and the pull's end later.
   */
  const begin = async (
    source: DeviceSource,
    trigger: SyncTrigger,
    actorId?: string,
  ): Promise<{ readonly id: string | null; readonly done: Promise<Row> }> => {
    const current = running.get(source.key);
    if (current) return { id: null, done: current };
    // Held before the first await, so a second call meanwhile joins it.
    let release!: (row: Promise<Row>) => void;
    const done = new Promise<Row>((resolve) => {
      release = resolve;
    });
    running.set(source.key, done);
    try {
      const run = await open(source.key, trigger, actorId);
      release(pull(source.key, run, source.pages()));
      const clear = () => running.delete(source.key);
      done.then(clear, clear);
      return { id: run.id, done };
    } catch (error) {
      running.delete(source.key);
      release(
        Promise.reject(
          error instanceof Error ? error : new Error(String(error)),
        ),
      );
      throw error;
    }
  };

  /** The run a pull just wrote, once its row exists. */
  const latestRun = async (source: DeviceSourceKey): Promise<Row | null> =>
    (await database
      .query()
      .selectFrom('deviceSyncRuns')
      .selectAll()
      .where('source', '=', source)
      .orderBy('startedAt', 'desc')
      .limit(1)
      .executeTakeFirst()) ?? null;

  return {
    async status() {
      const configured = new Set(deps.sources().map((source) => source.key));
      const rows = await database
        .query()
        .selectFrom('managedDevices')
        .select(['source', 'matchState', 'ownership', 'goneAt'])
        .execute();
      const result: SourceStatus[] = [];
      for (const key of DEVICE_SOURCES) {
        const mine = rows.filter((row) => row.source === key);
        const present = mine.filter((row) => !row.goneAt);
        const company = present.filter((row) => row.ownership !== 'personal');
        const success = await database
          .query()
          .selectFrom('deviceSyncRuns')
          .select('finishedAt')
          .where('source', '=', key)
          .where('status', '=', 'succeeded')
          .orderBy('startedAt', 'desc')
          .limit(1)
          .executeTakeFirst();
        result.push({
          key,
          configured: configured.has(key),
          running: running.has(key),
          lastRun: await latestRun(key),
          lastSuccessAt: iso(success?.finishedAt),
          counts: {
            devices: present.length,
            linked: present.filter((row) => row.matchState === 'linked').length,
            unlinked: company.filter((row) => row.matchState === 'unlinked')
              .length,
            ambiguous: company.filter((row) => row.matchState === 'ambiguous')
              .length,
            personal: present.length - company.length,
            gone: mine.length - present.length,
          },
        });
      }
      return result;
    },

    async start(trigger, actorId) {
      const runs: Row[] = [];
      for (const source of deps.sources()) {
        const { id, done } = await begin(source, trigger, actorId);
        // The pull carries on after the answer; its failures are its run's.
        done.catch((error: unknown) =>
          deps.log?.(`Device sync from ${source.key} failed`, error),
        );
        const run = id ? await runRow(id) : await latestRun(source.key);
        if (run) runs.push(run);
      }
      return runs;
    },

    async runAll(trigger, actorId) {
      const pulls = await Promise.all(
        deps.sources().map((source) => begin(source, trigger, actorId)),
      );
      return Promise.all(pulls.map((pull) => pull.done));
    },

    ingest,

    async matchDevice(deviceId, actorId) {
      const device = await database
        .query()
        .selectFrom('devices')
        .select(['id', 'serialNo'])
        .where('id', '=', deviceId)
        .executeTakeFirst<{ id: string; serialNo: string | null }>();
      const serial = normalizeSerial(device?.serialNo);
      if (!device || !serial) return;
      const records = await database
        .query()
        .selectFrom('managedDevices')
        .selectAll()
        .where('serialNo', '=', serial)
        .where('matchState', 'in', ['unlinked', 'ambiguous'])
        .execute<Row>();
      const open = records.filter((row) => row.matchedBy !== 'manual');
      if (open.length === 0) return;
      const register = await loadRegister();
      if ((register.bySerial.get(serial) ?? []).length !== 1) return;
      const now = new Date();
      for (const row of open) {
        await database
          .query()
          .updateTable('managedDevices')
          .set({
            deviceId,
            matchState: 'linked',
            matchedBy: 'serial',
            updatedAt: now,
          })
          .where('id', '=', String(row.id))
          .execute();
        await history.record({
          subjectType: 'devices',
          subjectId: deviceId,
          type: 'managedLinked',
          summary: `Linked to ${String(row.source)} device ${String(row.deviceName ?? row.externalId)} by serial number`,
          payload: {
            source: row.source,
            externalId: row.externalId,
            targetLabel: row.deviceName ?? row.externalId,
          },
          origin: 'sync',
          sourceType: 'managedDevices',
          sourceId: String(row.id),
          ...(actorId ? { actorId } : {}),
        });
      }
      deps.touched?.();
    },

    consoleUrlOf: (source, externalId) =>
      consoleUrl(source, externalId, deps.consoles?.()),

    async connected() {
      if (deps.sources().length > 0) return true;
      return Boolean(
        await database
          .query()
          .selectFrom('managedDevices')
          .select('id')
          .limit(1)
          .executeTakeFirst(),
      );
    },

    async forDevice(deviceId) {
      const rows = await database
        .query()
        .selectFrom('managedDevices')
        .selectAll()
        .where('deviceId', '=', deviceId)
        .where('matchState', '=', 'linked')
        .orderBy('lastSyncAt', 'desc')
        .execute();
      return rows.map((row) => ({
        id: String(row.id),
        source: row.source as DeviceSourceKey,
        externalId: String(row.externalId),
        deviceName: (row.deviceName as string | null) ?? null,
        manufacturer: (row.manufacturer as string | null) ?? null,
        model: (row.model as string | null) ?? null,
        osName: (row.osName as string | null) ?? null,
        osVersion: (row.osVersion as string | null) ?? null,
        userPrincipal: (row.userPrincipal as string | null) ?? null,
        userName: (row.userName as string | null) ?? null,
        personId: (row.personId as string | null) ?? null,
        ownership: String(row.ownership),
        compliance: (row.compliance as string | null) ?? null,
        encrypted:
          row.encrypted === null || row.encrypted === undefined
            ? null
            : Boolean(row.encrypted),
        enrolledAt: iso(row.enrolledAt),
        lastSyncAt: iso(row.lastSyncAt),
        lastSeenAt: iso(row.lastSeenAt),
        goneAt: iso(row.goneAt),
        matchedBy: (row.matchedBy as string | null) ?? null,
        consoleUrl: consoleUrl(
          String(row.source),
          String(row.externalId),
          deps.consoles?.(),
        ),
      }));
    },
  };
}
