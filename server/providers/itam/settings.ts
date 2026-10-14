import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

/**
 * ITAM configuration, one JSON document per key. Defaults live here so a
 * missing row never breaks a caller; the seed writes them so administrators
 * can see and edit them.
 */
export interface ItamSettings {
  readonly general: {
    readonly currency: string;
    readonly timeZone: string;
    readonly dateFormat: string;
  };
  readonly thresholds: {
    readonly warrantyDays: number;
    /** How far ahead a perpetual entitlement's maintenance end is flagged. */
    readonly maintenanceExpiryDays: number;
    /** How far ahead a subscription's renewal or end is flagged. */
    readonly subscriptionExpiryDays: number;
    readonly idleDays: number;
    readonly auditDays: number;
    readonly idleSeatRatio: number;
    readonly defaultStockMinimum: number;
    /**
     * Days to make a device ready for a joiner once it is back or has
     * arrived — wiped, installed, labelled (`onboarding.ts`, 2026-10-06).
     */
    readonly onboardingPrepDays: number;
    /** Days from ordering to arrival, for a shortfall's last order day. */
    readonly purchaseLeadDays: number;
  };
  readonly numbering: Readonly<Record<NumberingKind, NumberingRule>>;
  /** Device sync's thresholds (step 2, 2026-10-15). */
  readonly deviceSync: {
    /** A device in use that has not synced for this many days is 失联. */
    readonly staleDays: number;
    /** A device off the shelf that synced within this many days is 状态不符. */
    readonly recentDays: number;
    /**
     * The categories whose devices in use should be on a platform (未纳管);
     * a category covers its subcategories.
     */
    readonly managedCategoryIds: readonly string[];
    /** Leave the devices a platform marks personal out of every difference. */
    readonly ignorePersonal: boolean;
  };
  readonly ai: {
    readonly businessNotes: string;
    /**
     * Whether Noco chooses a joiner's equipment in the background
     * (`onboarding-advisor.ts`, 2026-10-06). On by default: the switch is
     * for a deployment that wants no model running unattended.
     */
    readonly onboardingAdvice: boolean;
    /**
     * Whether the AI plugin's own built-in employees were switched off once,
     * so the application's assistant is the one people meet. Set by the
     * registrar (`ai/index.ts`), not shown on the settings page; an
     * administrator who re-enables one on the AI employees page keeps it.
     */
    readonly builtInEmployeesDisabled: boolean;
    /**
     * The application's skills already put in front of the administrator:
     * added once to Noco's saved skill selection, and never again after
     * that, so one they removed stays removed (`ai/index.ts`, 2026-10-06).
     * Null until the registrar first records it. Not shown on the settings
     * page.
     */
    readonly offeredSkills: readonly string[] | null;
  };
}

export type NumberingKind = 'device' | 'purchaseOrder' | 'disposal' | 'repair';

export interface NumberingRule {
  readonly prefix: string;
  readonly width: number;
  readonly start: number;
}

export type ItamSettingsKey = keyof ItamSettings;

export const DEFAULT_ITAM_SETTINGS: ItamSettings = {
  general: {
    currency: 'CNY',
    timeZone: 'Asia/Shanghai',
    dateFormat: 'YYYY-MM-DD',
  },
  thresholds: {
    warrantyDays: 30,
    maintenanceExpiryDays: 30,
    subscriptionExpiryDays: 7,
    idleDays: 90,
    auditDays: 365,
    idleSeatRatio: 0.3,
    defaultStockMinimum: 5,
    onboardingPrepDays: 3,
    purchaseLeadDays: 7,
  },
  numbering: {
    device: { prefix: 'DE-', width: 6, start: 1 },
    purchaseOrder: { prefix: 'PO-', width: 6, start: 1 },
    disposal: { prefix: 'DP-', width: 6, start: 1 },
    repair: { prefix: 'RP-', width: 6, start: 1 },
  },
  deviceSync: {
    staleDays: 30,
    recentDays: 7,
    managedCategoryIds: ['cat-laptop', 'cat-desktop', 'cat-phone'],
    ignorePersonal: true,
  },
  ai: {
    businessNotes: '',
    onboardingAdvice: true,
    builtInEmployeesDisabled: false,
    offeredSkills: null,
  },
};

export interface SettingsService {
  all(): Promise<ItamSettings>;
  /**
   * Pass the transaction's connection when reading inside a transaction: the
   * SQLite pool holds one connection, so a read through the manager while a
   * transaction is open waits for it forever.
   */
  get<K extends ItamSettingsKey>(
    key: K,
    connection?: DatabaseConnection,
  ): Promise<ItamSettings[K]>;
  set<K extends ItamSettingsKey>(
    key: K,
    value: ItamSettings[K],
    actorId?: string,
  ): Promise<ItamSettings[K]>;
  /**
   * Called after each save, with the settings as stored: for a reader that
   * may not read the database when it needs them (the Agents plugin's
   * conversation rules run inside its own transaction). Returns what removes
   * the listener.
   */
  onSaved(
    listener: <K extends ItamSettingsKey>(
      key: K,
      value: ItamSettings[K],
    ) => void,
  ): () => void;
}

export const settingsServiceToken: ServiceToken<SettingsService> =
  createServiceToken<SettingsService>('itam/settings-service');

export function createSettingsService(
  database: DatabaseManager,
): SettingsService {
  const parse = (value: unknown): unknown =>
    typeof value === 'string' ? JSON.parse(value) : value;

  const merge = <K extends ItamSettingsKey>(
    key: K,
    stored: unknown,
  ): ItamSettings[K] => {
    const defaults = DEFAULT_ITAM_SETTINGS[key];
    if (!stored || typeof stored !== 'object') return defaults;
    // A numbering kind added after the rules were saved (repairs) keeps its
    // default instead of vanishing behind the stored map.
    if (key === 'numbering')
      return {
        ...defaults,
        ...(stored as ItamSettings['numbering']),
      };
    return { ...defaults, ...stored };
  };

  const listeners = new Set<
    <K extends ItamSettingsKey>(key: K, value: ItamSettings[K]) => void
  >();

  return {
    onSaved(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async all() {
      const rows = await database
        .query()
        .selectFrom('itamSettings')
        .select(['key', 'value'])
        .execute();
      const stored = new Map(rows.map((row) => [row.key, parse(row.value)]));
      const keys = Object.keys(DEFAULT_ITAM_SETTINGS) as ItamSettingsKey[];
      return Object.fromEntries(
        keys.map((key) => [key, merge(key, stored.get(key))]),
      ) as unknown as ItamSettings;
    },
    async get(key, connection) {
      const row = await (connection ? connection.query : database.query())
        .selectFrom('itamSettings')
        .select(['key', 'value'])
        .where('key', '=', key)
        .executeTakeFirst();
      return merge(key, row ? parse(row.value) : undefined);
    },
    async set(key, value, actorId) {
      const next = merge(key, value);
      const now = new Date();
      const existing = await database
        .query()
        .selectFrom('itamSettings')
        .select('key')
        .where('key', '=', key)
        .executeTakeFirst();
      if (existing) {
        await database
          .query()
          .updateTable('itamSettings')
          .set({
            value: next,
            updatedById: actorId ?? null,
            updatedAt: now,
          })
          .where('key', '=', key)
          .execute();
      } else {
        await database
          .query()
          .insertInto('itamSettings')
          .values({
            key,
            value: next,
            updatedById: actorId ?? null,
            updatedAt: now,
          })
          .execute();
      }
      for (const listener of listeners) listener(key, next);
      return next;
    },
  };
}
