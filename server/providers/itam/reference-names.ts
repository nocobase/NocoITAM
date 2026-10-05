import type { DatabaseManager } from '@nocobase/db';

import type { Row } from './collection-query.js';

/**
 * Which collection a reference field points at, by the field's name — the
 * convention every ITAM table follows. `parentId` points at its own
 * collection, and three fields name their collection through a type field
 * beside them (`TYPED_REFERENCES`). `user` is the authentication plugin's
 * account table (owners, executors).
 */
export const REFERENCE_FIELDS: Readonly<Record<string, string>> = {
  modelId: 'models',
  categoryId: 'categories',
  manufacturerId: 'manufacturers',
  locationId: 'locations',
  departmentId: 'departments',
  vendorId: 'vendors',
  lenderVendorId: 'vendors',
  recipientVendorId: 'vendors',
  softwareProductId: 'softwareProducts',
  deviceId: 'devices',
  entitlementId: 'entitlements',
  stockItemId: 'stockItems',
  purchaseOrderId: 'purchaseOrders',
  managerId: 'people',
  ownerId: 'user',
  createdById: 'user',
  executedById: 'user',
  userId: 'user',
  executorIds: 'user',
};

/** A reference whose collection its type field names (person / location / device). */
export const TYPED_REFERENCES: Readonly<Record<string, string>> = {
  assigneeId: 'assigneeType',
  holderId: 'holderType',
  reservedForId: 'reservedForType',
};

const TYPE_COLLECTIONS: Readonly<Record<string, string>> = {
  person: 'people',
  location: 'locations',
  device: 'devices',
};

/** The column a record is known by, where it is not `name`. */
const LABEL_COLUMNS: Readonly<Record<string, string>> = {
  devices: 'deviceNo',
  purchaseOrders: 'orderNo',
  disposals: 'disposalNo',
  repairs: 'repairNo',
};

/** The collection `field` of `row` points at, if it is a reference. */
export function referenceOf(
  row: Row,
  field: string,
  ownCollection?: string,
): string | undefined {
  if (field === 'parentId') return ownCollection;
  if (field in TYPED_REFERENCES)
    return TYPE_COLLECTIONS[String(row[TYPED_REFERENCES[field]])];
  return REFERENCE_FIELDS[field];
}

const idsOf = (value: unknown): string[] =>
  (Array.isArray(value) ? value : [value]).filter(
    (entry): entry is string => typeof entry === 'string' && entry !== '',
  );

/**
 * The names of every record the rows reference, by collection and id. A
 * collection `readable` refuses is not read; its ids stay as they are.
 */
export async function referenceNames(
  database: DatabaseManager,
  rows: readonly Row[],
  options: {
    readonly ownCollection?: string;
    readonly readable?: (collection: string) => Promise<boolean>;
  } = {},
): Promise<Map<string, Map<string, string>>> {
  const wanted = new Map<string, Set<string>>();
  for (const row of rows)
    for (const field of Object.keys(row)) {
      const collection = referenceOf(row, field, options.ownCollection);
      if (!collection) continue;
      const ids = idsOf(row[field]);
      if (ids.length === 0) continue;
      if (!wanted.has(collection)) wanted.set(collection, new Set());
      for (const id of ids) wanted.get(collection)!.add(id);
    }
  const names = new Map<string, Map<string, string>>();
  for (const [collection, ids] of wanted) {
    if (options.readable && !(await options.readable(collection))) continue;
    // A table this deployment lacks (the account table in a test database)
    // leaves its ids as they are rather than failing the whole read.
    const found = await lookUp(database, collection, [...ids]).catch(() => []);
    names.set(
      collection,
      new Map(
        found.map((row) => [
          String(row.id),
          typeof row.label === 'string' ? row.label : '',
        ]),
      ),
    );
  }
  return names;
}

async function lookUp(
  database: DatabaseManager,
  collection: string,
  ids: string[],
): Promise<{ id: string; label: unknown }[]> {
  return collection === 'user'
    ? (
        await database
          .query()
          .selectFrom('user')
          .select(['id', 'name', 'username'])
          .where('id', 'in', ids)
          .execute<{ id: string; name: unknown; username: unknown }>()
      ).map((row) => ({
        id: row.id,
        label:
          typeof row.name === 'string' && row.name ? row.name : row.username,
      }))
    : await database
        .query()
        .selectFrom(collection)
        .select(['id', `${LABEL_COLUMNS[collection] ?? 'name'} as label`])
        .where('id', 'in', ids)
        .execute<{ id: string; label: unknown }>();
}

/** The name `field` of `row` reads as, or its id when no name was read. */
export function nameOf(
  names: ReadonlyMap<string, ReadonlyMap<string, string>>,
  row: Row,
  field: string,
  ownCollection?: string,
): unknown {
  const collection = referenceOf(row, field, ownCollection);
  const value = row[field];
  if (!collection) return value;
  const label = (id: string) => names.get(collection)?.get(id) || id;
  if (Array.isArray(value)) return idsOf(value).map(label).join(', ');
  return typeof value === 'string' && value !== '' ? label(value) : value;
}
