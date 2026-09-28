import { masterDataPath, type ItamRecord } from './api.js';
import { ENTITLEMENT_FIELDS, ENTITLEMENTS_PATH } from './entitlements.js';
import type { FieldDefinition } from './fields.js';
import { masterDataByName } from './master-data.js';
import { PO_FIELDS, PURCHASE_ORDERS_PATH } from './procurement.js';
import {
  STOCK_PATH,
  STOCK_ROUTES,
  stockFields,
  type StockKind,
} from './stock.js';
import { text } from './format.js';

/** What a related list shows: any collection with an API path and fields. */
export interface RelatedTarget {
  readonly path: string;
  readonly fields: readonly FieldDefinition[];
  readonly nameField: string;
  /** Translation prefix for `${i18n}.empty`. */
  readonly i18n: string;
  readonly defaultSort?: string;
  readonly defaultOrder?: 'asc' | 'desc';
  /** Route for a row; stock items route by their kind. */
  readonly routeFor: (row: ItamRecord) => string;
  /** Fixed filter, e.g. a stock kind. */
  readonly listFilter?: Readonly<Record<string, string>>;
}

/** A master-data collection as a related-list target. */
export function masterTarget(collection: string): RelatedTarget {
  const target = masterDataByName(collection)!;
  return {
    path: masterDataPath(collection),
    fields: target.fields,
    nameField: target.nameField,
    i18n: target.i18n,
    defaultSort: target.defaultSort,
    routeFor: (row) => `/${target.route}/${row.id}`,
  };
}

/** Stock items of every kind; each row routes to its kind's list. */
export const stockTarget: RelatedTarget = {
  path: STOCK_PATH,
  // A related tab keeps its first four columns: the quantities read as
  // 累计入库 and 在库, as on the record, and the category (which follows the
  // model) gives way to 在库.
  fields: stockFields('accessory').filter(
    (field) => field.key !== 'categoryId',
  ),
  nameField: 'name',
  i18n: 'stock',
  defaultSort: 'name',
  routeFor: (row) =>
    `/${STOCK_ROUTES[text(row.kind) as StockKind] ?? 'accessories'}/${row.id}`,
};

/** Entitlements of both kinds (a software product's tab). */
export const entitlementTarget: RelatedTarget = {
  path: ENTITLEMENTS_PATH,
  fields: ENTITLEMENT_FIELDS.filter(
    (field) => field.column && field.key !== 'softwareProductId',
  ),
  nameField: 'name',
  i18n: 'entitlements',
  defaultSort: 'name',
  routeFor: (row) => `/entitlements/${row.id}`,
};

export const purchaseOrderTarget: RelatedTarget = {
  path: PURCHASE_ORDERS_PATH,
  fields: PO_FIELDS,
  nameField: 'orderNo',
  i18n: 'procurement',
  defaultSort: 'createdAt',
  defaultOrder: 'desc',
  routeFor: (row) => `/procurement/${row.id}`,
};
