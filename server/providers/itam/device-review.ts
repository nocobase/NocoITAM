import type { DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import { asText, type Row } from './collection-query.js';
import { dbDateTime } from './dates.js';
import { normalizeSerial } from './device-sources.js';
import type { DeviceSyncService } from './device-sync.js';
import { BusinessRuleError, RecordNotFoundError } from './errors.js';
import type { HistoryService } from './history.js';
import type { ItamSettings, SettingsService } from './settings.js';

/**
 * Device sync, step 2 (2026-10-15): where what the platforms report and the
 * register disagree, and what a person decides about it. Everything here is
 * computed when asked, from the current rows — like 需要关注 — so a
 * difference goes the moment either side changes. Nothing writes the
 * register except through the register's own operations, which the pages
 * call; this service records only the decisions about the platforms' rows:
 * a link, an unlink, a record kept off the register, and 以台账为准.
 */

/** A difference about one register device. */
export type CheckKind = 'stale' | 'userMismatch' | 'statusMismatch';

export interface DeviceCheck {
  readonly kind: CheckKind;
  /** Lost or disposed, yet online: a device that should not be anywhere. */
  readonly critical: boolean;
  readonly deviceId: string;
  readonly deviceNo: string | null;
  readonly deviceName: string | null;
  readonly status: string;
  readonly ownerId: string | null;
  readonly assigneeType: string | null;
  readonly assigneeId: string | null;
  /** The platform record the difference was read from. */
  readonly managedDeviceId: string;
  readonly source: string;
  readonly lastSyncAt: string | null;
  readonly goneAt: string | null;
  /** The platform's primary user, matched to a person or as it reads. */
  readonly personId: string | null;
  readonly userName: string | null;
  /** What a 以台账为准 on it keeps: the value that was seen. */
  readonly value: string;
}

/** A platform record no register device answers to. */
export interface UnregisteredDevice {
  readonly id: string;
  readonly source: string;
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
  readonly matchState: string;
  /** A register model whose name or part code reads the same, if any. */
  readonly suggestedModelId: string | null;
  /** That model's category and maker, which the create form shows with it. */
  readonly suggestedCategoryId: string | null;
  readonly suggestedManufacturerId: string | null;
  /** For a serial several devices share: those devices. */
  readonly candidates: readonly {
    readonly id: string;
    readonly label: string;
  }[];
  readonly ignoredById: string | null;
  readonly ignoredAt: string | null;
  readonly ignoreReason: string | null;
  readonly consoleUrl: string | null;
  /**
   * Every platform that reports this device (step 3): a Mac in both Intune
   * and Jamf is one row, its other records decided with it.
   */
  readonly sources: readonly string[];
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

export interface DeviceReviewService {
  /**
   * Whether any platform is connected or has reported: without one there is
   * nothing to compare, and the rules, the column and the tags stay away.
   */
  active(): Promise<boolean>;
  /** The differences on register devices, or on the devices given. */
  checks(options?: {
    readonly deviceIds?: readonly string[];
    readonly now?: Date;
  }): Promise<DeviceCheck[]>;
  /** Platform records nobody has put on the register or kept off it. */
  unregistered(now?: Date): Promise<UnregisteredDevice[]>;
  /** Platform records a person kept off the register. */
  ignored(): Promise<UnregisteredDevice[]>;
  /** Devices in use, in a category that should be managed, on no platform. */
  unmanaged(): Promise<UnmanagedDevice[]>;
  /**
   * Per leaver, how many devices whose primary user they are synced after
   * their leave date.
   */
  onlineAfterLeaving(
    people: readonly { readonly id: string; readonly leaveDate: string }[],
  ): Promise<Map<string, number>>;
  /**
   * Ties a platform record to a register device, by a person — or on a plan
   * Noco proposed and the person confirmed (`origin: 'agent'`).
   */
  link(
    managedId: string,
    deviceId: string,
    actorId: string,
    origin?: 'human' | 'agent',
  ): Promise<Row>;
  /** Unties it; a person's decision, so the next pull leaves it alone. */
  unlink(
    managedId: string,
    actorId: string,
    origin?: 'human' | 'agent',
  ): Promise<Row>;
  /** Keeps a platform record off the register, with the reason. */
  ignore(managedId: string, reason: string, actorId: string): Promise<Row>;
  /** Takes a kept-off record back: it is matched again at once. */
  restore(managedId: string, actorId: string): Promise<Row>;
  /** 以台账为准: this difference, with this value, is not raised again. */
  dismiss(deviceId: string, kind: CheckKind, actorId: string): Promise<void>;
}

export const deviceReviewServiceToken: ServiceToken<DeviceReviewService> =
  createServiceToken<DeviceReviewService>('itam/device-review-service');

const DAY = 86_400_000;
/** In use: a device someone should be using. */
const IN_USE: ReadonlySet<string> = new Set(['inUse', 'onLoan']);
/** Off the shelf for good, or for now: online is a contradiction. */
const OFF_DUTY: ReadonlySet<string> = new Set([
  'inStock',
  'retired',
  'pendingDisposal',
  'disposed',
  'lost',
]);
const CRITICAL: ReadonlySet<string> = new Set(['lost', 'disposed']);

const iso = (value: unknown): string | null => {
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' && value ? value : null;
};
const time = (value: unknown): number | null => {
  const text = iso(value);
  if (!text) return null;
  const at = new Date(text).getTime();
  return Number.isNaN(at) ? null : at;
};
const normalizeName = (value: unknown): string =>
  (typeof value === 'string' ? value : '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** The thresholds as used: whole days, within sense. */
function limits(settings: ItamSettings['deviceSync']) {
  const days = (value: unknown, fallback: number) => {
    const n = Math.round(Number(value));
    return Number.isFinite(n) && n >= 1 && n <= 3650 ? n : fallback;
  };
  return {
    staleDays: days(settings.staleDays, 30),
    recentDays: days(settings.recentDays, 7),
    managedCategoryIds: Array.isArray(settings.managedCategoryIds)
      ? settings.managedCategoryIds.map(String)
      : [],
    ignorePersonal: settings.ignorePersonal !== false,
  };
}

export function createDeviceReviewService(deps: {
  readonly database: DatabaseManager;
  readonly settings: SettingsService;
  readonly history: HistoryService;
  readonly sync: DeviceSyncService;
  readonly touched?: () => void;
}): DeviceReviewService {
  const { database, settings, history, sync } = deps;

  const managedRow = async (id: string): Promise<Row> => {
    const row = await database
      .query()
      .selectFrom('managedDevices')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst<Row>();
    if (!row) throw new RecordNotFoundError('managedDevices', id);
    return row;
  };

  const update = async (id: string, values: Record<string, unknown>) => {
    await database
      .query()
      .updateTable('managedDevices')
      .set({ ...values, updatedAt: new Date() })
      .where('id', '=', id)
      .execute();
    deps.touched?.();
    return managedRow(id);
  };

  /** Models by their normalized name and part code, for 补登记. */
  const modelIndex = async () => {
    const models = await database
      .query()
      .selectFrom('models')
      .select(['id', 'name', 'code', 'categoryId', 'manufacturerId'])
      .execute<{
        id: string;
        name: string;
        code: string | null;
        categoryId: string | null;
        manufacturerId: string | null;
      }>();
    const index = new Map<string, (typeof models)[number]>();
    for (const model of models) {
      for (const key of [normalizeName(model.name), normalizeName(model.code)])
        if (key && !index.has(key)) index.set(key, model);
    }
    return index;
  };

  const toUnregistered = (
    row: Row,
    models: Awaited<ReturnType<typeof modelIndex>>,
    candidates: Map<string, { id: string; label: string }[]>,
  ): UnregisteredDevice => {
    const serial = asText(row.serialNo) ?? null;
    return {
      id: String(row.id),
      source: String(row.source),
      externalId: String(row.externalId),
      serialNo: serial,
      deviceName: asText(row.deviceName) ?? null,
      manufacturer: asText(row.manufacturer) ?? null,
      model: asText(row.model) ?? null,
      osName: asText(row.osName) ?? null,
      osVersion: asText(row.osVersion) ?? null,
      personId: asText(row.personId) ?? null,
      userName: asText(row.userName) ?? asText(row.userPrincipal) ?? null,
      ownership: String(row.ownership),
      lastSyncAt: iso(row.lastSyncAt),
      matchState: String(row.matchState),
      suggestedModelId: models.get(normalizeName(row.model))?.id ?? null,
      suggestedCategoryId:
        models.get(normalizeName(row.model))?.categoryId ?? null,
      suggestedManufacturerId:
        models.get(normalizeName(row.model))?.manufacturerId ?? null,
      candidates: serial ? (candidates.get(serial) ?? []) : [],
      ignoredById: asText(row.ignoredById) ?? null,
      ignoredAt: iso(row.ignoredAt),
      ignoreReason: asText(row.ignoreReason) ?? null,
      consoleUrl: sync.consoleUrlOf(String(row.source), String(row.externalId)),
      sources: [String(row.source)],
    };
  };

  /**
   * One row per physical device: records of one serial from several
   * platforms fold into the latest (step 3, 2026-10-15). Rows come latest
   * first.
   */
  const fold = (rows: UnregisteredDevice[]): UnregisteredDevice[] => {
    const bySerial = new Map<string, UnregisteredDevice>();
    const result: UnregisteredDevice[] = [];
    for (const row of rows) {
      const first = row.serialNo ? bySerial.get(row.serialNo) : undefined;
      if (!first) {
        const kept = { ...row, sources: [...row.sources] };
        if (row.serialNo) bySerial.set(row.serialNo, kept);
        result.push(kept);
        continue;
      }
      for (const source of row.sources)
        if (!first.sources.includes(source))
          (first.sources as string[]).push(source);
    }
    return result;
  };

  /** The other unlinked records of the same serial: the same device. */
  const sameDevice = async (row: Row): Promise<string[]> => {
    const serial = asText(row.serialNo);
    if (!serial) return [];
    const rows = await database
      .query()
      .selectFrom('managedDevices')
      .select(['id', 'matchState'])
      .where('serialNo', '=', serial)
      .where('id', '!=', String(row.id))
      .execute<{ id: string; matchState: string }>();
    return rows
      .filter((other) => other.matchState !== 'linked')
      .map((other) => other.id);
  };

  /** Register devices sharing each serial, for the ambiguous rows. */
  const sharedSerials = async (rows: readonly Row[]) => {
    const wanted = new Set(
      rows
        .filter((row) => row.matchState === 'ambiguous')
        .map((row) => asText(row.serialNo))
        .filter((serial): serial is string => Boolean(serial)),
    );
    const result = new Map<string, { id: string; label: string }[]>();
    if (wanted.size === 0) return result;
    const devices = await database
      .query()
      .selectFrom('devices')
      .select(['id', 'deviceNo', 'name', 'serialNo'])
      .execute<Row>();
    for (const device of devices) {
      const serial = normalizeSerial(asText(device.serialNo));
      if (!serial || !wanted.has(serial)) continue;
      result.set(serial, [
        ...(result.get(serial) ?? []),
        {
          id: String(device.id),
          label: [asText(device.deviceNo), asText(device.name)]
            .filter(Boolean)
            .join(' / '),
        },
      ]);
    }
    return result;
  };

  /** Categories and every subcategory under them. */
  const withSubcategories = async (
    ids: readonly string[],
  ): Promise<Set<string>> => {
    const categories = await database
      .query()
      .selectFrom('categories')
      .select(['id', 'parentId'])
      .execute<{ id: string; parentId: string | null }>();
    const covered = new Set(ids);
    let grew = true;
    while (grew) {
      grew = false;
      for (const category of categories)
        if (
          category.parentId &&
          covered.has(category.parentId) &&
          !covered.has(category.id)
        ) {
          covered.add(category.id);
          grew = true;
        }
    }
    return covered;
  };

  const self: DeviceReviewService = {
    active: () => sync.connected(),

    async checks(options = {}) {
      if (!(await sync.connected())) return [];
      const now = (options.now ?? new Date()).getTime();
      const config = limits(await settings.get('deviceSync'));
      let query = database
        .query()
        .selectFrom('managedDevices')
        .selectAll()
        .where('matchState', '=', 'linked')
        .where('deviceId', 'is not', null);
      if (options.deviceIds)
        query = query.where(
          'deviceId',
          'in',
          options.deviceIds.length ? [...options.deviceIds] : ['__none__'],
        );
      const observations = (await query.execute<Row>()).filter(
        (row) => !(config.ignorePersonal && row.ownership === 'personal'),
      );
      if (observations.length === 0) return [];
      const byDevice = new Map<string, Row[]>();
      for (const row of observations) {
        const id = String(row.deviceId);
        byDevice.set(id, [...(byDevice.get(id) ?? []), row]);
      }
      const devices = await database
        .query()
        .selectFrom('devices')
        .select([
          'id',
          'deviceNo',
          'name',
          'status',
          'ownerId',
          'assigneeType',
          'assigneeId',
        ])
        .where('id', 'in', [...byDevice.keys()])
        .execute<Row>();
      const dismissals = await database
        .query()
        .selectFrom('deviceSyncDismissals')
        .select(['deviceId', 'kind', 'value'])
        .where('deviceId', 'in', [...byDevice.keys()])
        .execute<{ deviceId: string; kind: string; value: string }>();
      const dismissed = new Set(
        dismissals.map((row) => `${row.deviceId}|${row.kind}|${row.value}`),
      );
      const result: DeviceCheck[] = [];
      for (const device of devices) {
        const id = String(device.id);
        const rows = byDevice.get(id) ?? [];
        // The platform's view is its latest word on the device.
        const present = rows.filter((row) => !row.goneAt);
        const latest = [...(present.length ? present : rows)].sort(
          (a, b) => (time(b.lastSyncAt) ?? 0) - (time(a.lastSyncAt) ?? 0),
        )[0];
        if (!latest) continue;
        const lastSync = time(latest.lastSyncAt);
        const status = String(device.status);
        const base = {
          deviceId: id,
          deviceNo: asText(device.deviceNo) ?? null,
          deviceName: asText(device.name) ?? null,
          status,
          ownerId: asText(device.ownerId) ?? null,
          assigneeType: asText(device.assigneeType) ?? null,
          assigneeId: asText(device.assigneeId) ?? null,
          managedDeviceId: String(latest.id),
          source: String(latest.source),
          lastSyncAt: iso(latest.lastSyncAt),
          goneAt: iso(latest.goneAt),
          personId: asText(latest.personId) ?? null,
          userName:
            asText(latest.userName) ?? asText(latest.userPrincipal) ?? null,
        };
        const push = (kind: CheckKind, value: string, critical = false) => {
          if (!dismissed.has(`${id}|${kind}|${value}`))
            result.push({ ...base, kind, value, critical });
        };
        const fresh =
          present.length > 0 &&
          lastSync !== null &&
          now - lastSync <= config.staleDays * DAY;
        if (IN_USE.has(status)) {
          if (!fresh)
            push(
              'stale',
              present.length ? (iso(latest.lastSyncAt) ?? 'never') : 'gone',
            );
          else if (
            device.assigneeType === 'person' &&
            base.personId &&
            base.personId !== base.assigneeId
          )
            push('userMismatch', base.personId);
        } else if (
          OFF_DUTY.has(status) &&
          present.length > 0 &&
          lastSync !== null &&
          now - lastSync <= config.recentDays * DAY
        )
          push('statusMismatch', status, CRITICAL.has(status));
      }
      // The ones that should not be anywhere first, then the longest silent.
      return result.sort(
        (a, b) =>
          Number(b.critical) - Number(a.critical) ||
          (time(a.lastSyncAt) ?? 0) - (time(b.lastSyncAt) ?? 0),
      );
    },

    async unregistered(now = new Date()) {
      if (!(await sync.connected())) return [];
      const config = limits(await settings.get('deviceSync'));
      let query = database
        .query()
        .selectFrom('managedDevices')
        .selectAll()
        .where('matchState', 'in', ['unlinked', 'ambiguous'])
        .where('goneAt', 'is', null)
        // A record silent for longer than a device in use may be is not
        // worth putting on the register.
        .where(
          'lastSyncAt',
          '>=',
          dbDateTime(new Date(now.getTime() - config.staleDays * DAY)),
        );
      if (config.ignorePersonal)
        query = query.where('ownership', '!=', 'personal');
      const rows = await query.orderBy('lastSyncAt', 'desc').execute<Row>();
      const models = await modelIndex();
      const shared = await sharedSerials(rows);
      return fold(rows.map((row) => toUnregistered(row, models, shared)));
    },

    async ignored() {
      const rows = await database
        .query()
        .selectFrom('managedDevices')
        .selectAll()
        .where('matchState', '=', 'ignored')
        .orderBy('ignoredAt', 'desc')
        .execute<Row>();
      const models = await modelIndex();
      return fold(rows.map((row) => toUnregistered(row, models, new Map())));
    },

    async unmanaged() {
      if (!(await sync.connected())) return [];
      const config = limits(await settings.get('deviceSync'));
      if (config.managedCategoryIds.length === 0) return [];
      const categories = await withSubcategories(config.managedCategoryIds);
      const managed = await database
        .query()
        .selectFrom('managedDevices')
        .select('deviceId')
        .where('matchState', '=', 'linked')
        .where('goneAt', 'is', null)
        .execute<{ deviceId: string | null }>();
      const onPlatform = new Set(
        managed.map((row) => row.deviceId).filter(Boolean),
      );
      const devices = await database
        .query()
        .selectFrom('devices')
        .select([
          'id',
          'deviceNo',
          'name',
          'categoryId',
          'ownerId',
          'assigneeType',
          'assigneeId',
        ])
        .where('status', 'in', [...IN_USE])
        .where('categoryId', 'in', [...categories])
        .orderBy('deviceNo')
        .execute<Row>();
      return devices
        .filter((device) => !onPlatform.has(String(device.id)))
        .map((device) => ({
          id: String(device.id),
          deviceNo: asText(device.deviceNo) ?? null,
          name: asText(device.name) ?? null,
          categoryId: asText(device.categoryId) ?? null,
          ownerId: asText(device.ownerId) ?? null,
          assigneeType: asText(device.assigneeType) ?? null,
          assigneeId: asText(device.assigneeId) ?? null,
        }));
    },

    async onlineAfterLeaving(people) {
      const result = new Map<string, number>();
      if (people.length === 0 || !(await sync.connected())) return result;
      const config = limits(await settings.get('deviceSync'));
      let query = database
        .query()
        .selectFrom('managedDevices')
        .select(['personId', 'lastSyncAt', 'ownership'])
        .where(
          'personId',
          'in',
          people.map((person) => person.id),
        )
        .where('goneAt', 'is', null);
      if (config.ignorePersonal)
        query = query.where('ownership', '!=', 'personal');
      const rows = await query.execute<Row>();
      const leftOn = new Map(
        people.map((person) => [person.id, person.leaveDate]),
      );
      for (const row of rows) {
        const person = String(row.personId);
        const leaveDate = leftOn.get(person);
        const synced = iso(row.lastSyncAt);
        // A calendar date against a timestamp: synced on a later day.
        if (leaveDate && synced && synced.slice(0, 10) > leaveDate)
          result.set(person, (result.get(person) ?? 0) + 1);
      }
      return result;
    },

    async link(managedId, deviceId, actorId, origin = 'human') {
      const row = await managedRow(managedId);
      if (row.matchState === 'linked' && row.deviceId === deviceId) return row;
      await history.record({
        subjectType: 'devices',
        subjectId: deviceId,
        type: 'managedLinked',
        summary: `Linked to ${String(row.source)} device ${asText(row.deviceName) ?? String(row.externalId)} by hand`,
        payload: {
          source: row.source,
          externalId: row.externalId,
          targetLabel: asText(row.deviceName) ?? String(row.externalId),
          manual: true,
        },
        origin,
        sourceType: 'managedDevices',
        sourceId: managedId,
        actorId,
      });
      return update(managedId, {
        deviceId,
        matchState: 'linked',
        matchedBy: 'manual',
        ignoredById: null,
        ignoredAt: null,
        ignoreReason: null,
      });
    },

    async unlink(managedId, actorId, origin = 'human') {
      const row = await managedRow(managedId);
      const deviceId = asText(row.deviceId);
      if (row.matchState !== 'linked' || !deviceId)
        throw new BusinessRuleError(
          'This platform record is not linked to a device',
          'deviceSync.notLinked',
        );
      await history.record({
        subjectType: 'devices',
        subjectId: deviceId,
        type: 'managedUnlinked',
        summary: `Unlinked from ${String(row.source)} device ${asText(row.deviceName) ?? String(row.externalId)}`,
        payload: {
          source: row.source,
          externalId: row.externalId,
          targetLabel: asText(row.deviceName) ?? String(row.externalId),
        },
        origin,
        sourceType: 'managedDevices',
        sourceId: managedId,
        actorId,
      });
      // `manual`: a person's decision, which the next pull keeps.
      return update(managedId, {
        deviceId: null,
        matchState: 'unlinked',
        matchedBy: 'manual',
      });
    },

    async ignore(managedId, reason, actorId) {
      const row = await managedRow(managedId);
      if (row.matchState === 'linked')
        throw new BusinessRuleError(
          'A linked platform record cannot be kept off the register',
          'deviceSync.linked',
        );
      // Its records on the other platforms are the same device.
      const decision = {
        matchState: 'ignored',
        ignoredById: actorId,
        ignoredAt: new Date(),
        ignoreReason: reason,
      };
      for (const other of await sameDevice(row)) await update(other, decision);
      return update(managedId, decision);
    },

    async restore(managedId) {
      const row = await managedRow(managedId);
      if (row.matchState !== 'ignored') return row;
      // Matched again now, the way a pull would, so it does not wait a night.
      const serial = asText(row.serialNo);
      const devices = serial
        ? (
            await database
              .query()
              .selectFrom('devices')
              .select(['id', 'serialNo'])
              .execute<{ id: string; serialNo: string | null }>()
          ).filter((device) => normalizeSerial(device.serialNo) === serial)
        : [];
      const decision = {
        ignoredById: null,
        ignoredAt: null,
        ignoreReason: null,
        matchedBy: devices.length === 1 ? 'serial' : null,
        deviceId: devices.length === 1 ? devices[0].id : null,
        matchState:
          devices.length === 1
            ? 'linked'
            : devices.length > 1
              ? 'ambiguous'
              : 'unlinked',
      };
      for (const other of await sameDevice(row)) await update(other, decision);
      return update(managedId, decision);
    },

    async dismiss(deviceId, kind, actorId) {
      const [check] = (await self.checks({ deviceIds: [deviceId] })).filter(
        (entry) => entry.kind === kind,
      );
      if (!check)
        throw new BusinessRuleError(
          'There is no such difference on this device',
          'deviceSync.noDifference',
        );
      await database
        .query()
        .insertInto('deviceSyncDismissals')
        .values({
          id: crypto.randomUUID(),
          deviceId,
          kind,
          value: check.value,
          dismissedById: actorId,
          createdAt: new Date(),
        })
        .execute();
      await history.record({
        subjectType: 'devices',
        subjectId: deviceId,
        type: 'managedDismissed',
        summary: `Kept the register as it is (${kind})`,
        payload: { kind, source: check.source },
        origin: 'human',
        sourceType: 'managedDevices',
        sourceId: check.managedDeviceId,
        actorId,
      });
      deps.touched?.();
    },
  };
  return self;
}
