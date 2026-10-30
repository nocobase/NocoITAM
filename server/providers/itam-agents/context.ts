import type { Agents } from '@nocobase/app-plugin-agents/server/tokens';
import type { DatabaseConnection } from '@nocobase/db';

/**
 * What a message's page context may name on ITAM (the plugin keeps only ids;
 * each kind's owner says what they are): a record of each collection with a
 * page, by its number or name, linking to that page.
 *
 * The plugin calls these inside the transaction that saves the message, and
 * SQLite holds one connection: every read goes through `conn`, and whether
 * the person may read a collection comes from the snapshot their last
 * visit took (`ReadSnapshots`, filled by `/itam/ai/status`, which the shell
 * asks on every load) rather than from authorization, which would read the
 * database outside it. Without a snapshot nothing resolves, so a context
 * never tells anyone that a record exists. A page registers only what it
 * shows the reader, whose record-level scope it was read under.
 */

interface Kind {
  readonly table: string;
  /** The columns that name a record, joined by a space. */
  readonly title: readonly string[];
  /** The number a person calls it by, when it has one. */
  readonly key?: string;
  /** The application path of its page. */
  readonly path: (row: Record<string, unknown>) => string;
}

const STOCK_ROUTES: Readonly<Record<string, string>> = {
  accessory: 'accessories',
  consumable: 'consumables',
  component: 'components',
};

const page =
  (route: string) =>
  (row: Record<string, unknown>): string =>
    `/${route}/${String(row.id)}`;

export const CONTEXT_KINDS: Readonly<Record<string, Kind>> = {
  devices: {
    table: 'devices',
    title: ['deviceNo', 'name'],
    key: 'deviceNo',
    path: page('devices'),
  },
  stockItems: {
    table: 'stockItems',
    title: ['name'],
    path: (row) =>
      `/${STOCK_ROUTES[String(row.kind)] ?? 'accessories'}/${String(row.id)}`,
  },
  entitlements: {
    table: 'entitlements',
    title: ['name'],
    path: page('entitlements'),
  },
  purchaseOrders: {
    table: 'purchaseOrders',
    title: ['orderNo'],
    key: 'orderNo',
    path: page('purchases'),
  },
  auditTasks: {
    table: 'auditTasks',
    title: ['name'],
    path: page('audits'),
  },
  disposals: {
    table: 'disposals',
    title: ['disposalNo'],
    key: 'disposalNo',
    path: page('disposals'),
  },
  repairs: {
    table: 'repairs',
    title: ['repairNo'],
    key: 'repairNo',
    path: page('repairs'),
  },
  people: { table: 'people', title: ['name'], path: page('people') },
  models: { table: 'models', title: ['name'], path: page('models') },
  softwareProducts: {
    table: 'softwareProducts',
    title: ['name'],
    path: page('software-products'),
  },
  categories: {
    table: 'categories',
    title: ['name'],
    path: page('categories'),
  },
  manufacturers: {
    table: 'manufacturers',
    title: ['name'],
    path: page('manufacturers'),
  },
  vendors: { table: 'vendors', title: ['name'], path: page('vendors') },
  locations: { table: 'locations', title: ['name'], path: page('locations') },
  departments: {
    table: 'departments',
    title: ['name'],
    path: page('departments'),
  },
};

/** Which collections each person could read when they last loaded a page. */
export interface ReadSnapshots {
  set(userId: string, collections: readonly string[]): void;
  get(userId: string): ReadonlySet<string> | undefined;
}

const SNAPSHOT_MS = 12 * 60 * 60 * 1000;

export function createReadSnapshots(): ReadSnapshots {
  const snapshots = new Map<string, { at: number; set: Set<string> }>();
  return {
    set(userId, collections) {
      snapshots.set(userId, { at: Date.now(), set: new Set(collections) });
    },
    get(userId) {
      const entry = snapshots.get(userId);
      if (!entry || Date.now() - entry.at > SNAPSHOT_MS) return undefined;
      return entry.set;
    },
  };
}

export function registerContextKinds(
  agents: Agents,
  snapshots: ReadSnapshots,
  basePath: string,
): (() => void)[] {
  return Object.entries(CONTEXT_KINDS).map(([kind, definition]) =>
    agents.conversations.contextKinds.register(
      kind,
      async (conn: DatabaseConnection, userId: string, ids) => {
        const resolved = new Map<
          string,
          { title: string; key: string | null; url: string | null }
        >();
        if (!snapshots.get(userId)?.has(kind) || !ids.length) return resolved;
        const columns = [
          'id',
          ...definition.title,
          ...(kind === 'stockItems' ? ['kind'] : []),
        ];
        const rows = await conn.query
          .selectFrom(definition.table)
          .select(columns)
          .where('id', 'in', [...ids])
          .execute<Record<string, unknown>>();
        for (const row of rows) {
          const title = definition.title
            .map((column) => row[column])
            .filter((value) => value != null && value !== '')
            .map(String)
            .join(' ');
          resolved.set(String(row.id), {
            title: title || String(row.id),
            key:
              definition.key && row[definition.key] != null
                ? String(row[definition.key])
                : null,
            url: `${basePath}${definition.path(row)}`,
          });
        }
        return resolved;
      },
    ),
  );
}
