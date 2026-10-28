import type { DatabaseAuthorizationConditions } from '@nocobase/app-plugin-authorization/server';
import type { DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { DeviceService, OperationContext } from './devices.js';
import { asText, type Row } from './collection-query.js';
import { findItamCollection } from './collections.js';
import { parseCsv } from './csv.js';
import { ValidationError } from './errors.js';
import type { EntitlementService } from './entitlements.js';
import type { MasterDataService } from './master-data.js';
import type { LineInput, ProcurementService } from './procurement.js';
import { unrestricted } from './authz-filter.js';
import type { StockService } from './stock.js';

/**
 * CSV import in three steps: preview (columns, sample rows, a suggested
 * mapping), validate (every row checked: required, unique numbers, names
 * resolved to references, model normalisation), commit (rows created or
 * updated through the domain services, so every rule and history entry
 * applies). Rows that fail are reported with their line and reason.
 */
export type ImportFieldType =
  'text' | 'number' | 'boolean' | 'date' | 'enum' | 'reference' | 'list';

export interface ImportField {
  readonly key: string;
  readonly type: ImportFieldType;
  readonly required?: boolean;
  /** For `reference`: the collection whose `name` (or number) the cell holds. */
  readonly reference?: string;
  readonly options?: readonly string[];
  /** Column names (lower-cased) that map to this field automatically. */
  readonly aliases?: readonly string[];
}

/**
 * A collection whose record is a document with lines: several CSV rows make
 * one record. `by` names the column that says which rows belong together
 * (a purchase order's number in the file — the application assigns its own),
 * and `lines` maps the row's own fields to the keys the child input uses.
 * The remaining fields describe the document and are read from the group's
 * first row; a later row may repeat them but must not contradict them.
 */
export interface ImportGroup {
  readonly by: string;
  readonly lines: Readonly<Record<string, string>>;
}

export interface ImportSpec {
  readonly fields: readonly ImportField[];
  /** Fields whose value must be unique; also used to find an existing row for upsert. */
  readonly match?: readonly string[];
  readonly defaults?: Readonly<Record<string, unknown>>;
  /** Set when one record is built from several rows; imports are then create-only. */
  readonly group?: ImportGroup;
}

const ref = (
  key: string,
  reference: string,
  required = false,
  aliases: string[] = [],
): ImportField => ({
  key,
  type: 'reference',
  reference,
  required,
  aliases,
});
const text = (
  key: string,
  required = false,
  aliases: string[] = [],
): ImportField => ({ key, type: 'text', required, aliases });
const date = (key: string, aliases: string[] = []): ImportField => ({
  key,
  type: 'date',
  aliases,
});
const num = (key: string, aliases: string[] = []): ImportField => ({
  key,
  type: 'number',
  aliases,
});
const bool = (key: string): ImportField => ({ key, type: 'boolean' });
const en = (
  key: string,
  options: readonly string[],
  required = false,
): ImportField => ({ key, type: 'enum', options, required });

export const IMPORT_SPECS: Readonly<Record<string, ImportSpec>> = {
  manufacturers: {
    fields: [
      text('name', true),
      text('website'),
      text('supportPhone'),
      text('supportEmail'),
      text('supportUrl'),
      text('notes'),
    ],
    match: ['name'],
  },
  vendors: {
    fields: [
      text('name', true),
      {
        key: 'types',
        type: 'list',
        options: [
          'equipment',
          'softwareReseller',
          'serviceProvider',
          'repairProvider',
          'lessor',
          'recycler',
          'other',
        ],
      },
      text('contactName'),
      text('phone'),
      text('email'),
      text('address'),
      text('website'),
      text('notes'),
    ],
    match: ['name'],
  },
  categories: {
    fields: [
      text('name', true),
      ref('parentId', 'categories', false, ['parent']),
      en(
        'appliesTo',
        ['device', 'accessory', 'consumable', 'component', 'entitlement'],
        true,
      ),
      bool('requiresSerial'),
      bool('assignableToPerson'),
      en('depreciationMethod', ['none', 'straightLine']),
      num('usefulLifeMonths'),
      num('residualRate'),
      num('warrantyMonths'),
      num('replacementMonths'),
      num('auditCycleDays'),
    ],
    match: ['name'],
    defaults: { requiresSerial: false, assignableToPerson: true, sort: 0 },
  },
  models: {
    fields: [
      text('name', true, ['model', 'model name']),
      ref('categoryId', 'categories', true, ['category']),
      ref('manufacturerId', 'manufacturers', true, ['manufacturer', 'brand']),
      text('code'),
      text('specification'),
      num('warrantyMonths'),
      num('replacementMonths'),
      date('releaseDate'),
      date('eolDate'),
      date('eosDate'),
    ],
    match: ['name'],
  },
  softwareProducts: {
    fields: [
      text('name', true),
      ref('categoryId', 'categories', true, ['category']),
      ref('manufacturerId', 'manufacturers', false, [
        'manufacturer',
        'publisher',
      ]),
      en('deliveryMethod', ['onPremise', 'saas', 'both'], true),
      text('notes'),
    ],
    match: ['name'],
  },
  locations: {
    fields: [
      text('name', true),
      ref('parentId', 'locations', false, ['parent']),
      en(
        'type',
        [
          'company',
          'campus',
          'building',
          'floor',
          'room',
          'rack',
          'warehouse',
          'other',
        ],
        true,
      ),
      text('address'),
      text('notes'),
    ],
    match: ['name'],
    defaults: { sort: 0 },
  },
  departments: {
    fields: [
      text('name', true),
      ref('parentId', 'departments', false, ['parent']),
      ref('managerId', 'people', false, ['manager']),
    ],
    match: ['name'],
    defaults: { sort: 0 },
  },
  people: {
    fields: [
      text('name', true, ['person', 'employee', 'full name']),
      text('employeeNo', false, ['employee no', 'staff no']),
      text('email'),
      text('phone'),
      ref('departmentId', 'departments', false, ['department']),
      text('position'),
      ref('locationId', 'locations', false, ['location']),
      date('hireDate'),
      date('leaveDate'),
      text('notes'),
    ],
    // No 在职状态 column: it follows the joining and leave dates, which are
    // imported, and creating or updating a person refuses it as an input —
    // the default of `active` this spec used to send failed every row.
    match: ['employeeNo', 'email'],
    defaults: {},
  },
  devices: {
    fields: [
      // Exports from other tools still say asset; both spellings match.
      text('deviceNo', false, [
        'device no',
        'device number',
        'asset no',
        'asset number',
        'asset tag',
        'tag',
      ]),
      text('serialNo', false, ['serial', 'serial number', 'sn']),
      text('name'),
      ref('modelId', 'models', true, ['model']),
      ref('locationId', 'locations', true, ['location']),
      ref('departmentId', 'departments', false, ['department']),
      en('ownership', ['owned', 'leased', 'borrowed', 'byod']),
      ref('vendorId', 'vendors', false, ['vendor', 'supplier']),
      date('purchaseDate'),
      num('purchasePrice', ['price', 'cost']),
      text('currency'),
      date('warrantyEndDate', ['warranty end', 'warranty']),
      date('plannedReplacementDate'),
      text('notes'),
    ],
    match: ['deviceNo', 'serialNo'],
  },
  stockItems: {
    fields: [
      text('name', true),
      en('kind', ['accessory', 'consumable', 'component'], true),
      ref('categoryId', 'categories', true, ['category']),
      ref('modelId', 'models', false, ['model']),
      ref('manufacturerId', 'manufacturers', false, ['manufacturer']),
      ref('locationId', 'locations', true, ['location']),
      num('totalQuantity', ['quantity', 'qty']),
      num('minimumQuantity', ['minimum']),
      text('notes'),
    ],
    match: ['name'],
  },
  // Both kinds in one file: the kind column says which of the remaining
  // columns apply (the licensing model for both; product key and
  // maintenance for perpetual; billing, console and auto-renew for
  // subscriptions).
  entitlements: {
    fields: [
      en('kind', ['perpetual', 'subscription'], true),
      text('name', true),
      ref('softwareProductId', 'softwareProducts', true, [
        'software',
        'product',
      ]),
      en('licensingModel', ['perUser', 'perDevice', 'site', 'free']),
      en('billingModel', ['perSeat', 'flat']),
      en('billingCycle', ['month', 'quarter', 'year']),
      num('seatCount', ['seats']),
      text('productKey'),
      date('startDate', ['effectiveDate']),
      date('expiryDate'),
      date('maintenanceExpiryDate'),
      num('unitPrice'),
      text('currency'),
      bool('autoRenew'),
      text('consoleUrl'),
      text('notes'),
    ],
    match: ['name'],
  },
  // A purchase order is a document with lines, so one row is one line and
  // the rows sharing an order number make one order. The number in the file
  // only groups the rows — the application assigns the order its own number.
  purchaseOrders: {
    fields: [
      text('orderKey', true, ['orderno', 'order no', 'order', 'po', 'pono']),
      en(
        'reason',
        [
          'newHire',
          'batchReplacement',
          'stockReplenishment',
          'project',
          'faultReplacement',
          'other',
        ],
        true,
      ),
      text('description'),
      ref('vendorId', 'vendors', false, ['vendor']),
      ref('departmentId', 'departments', false, ['department']),
      date('neededBy'),
      date('expectedAt', ['expected']),
      text('currency'),
      en(
        'itemType',
        [
          'device',
          'accessory',
          'consumable',
          'component',
          'perpetual',
          'subscription',
        ],
        true,
      ),
      ref('modelId', 'models', false, ['model']),
      ref('softwareProductId', 'softwareProducts', false, [
        'software',
        'product',
      ]),
      { key: 'quantity', type: 'number', required: true, aliases: ['qty'] },
      num('unitPrice', ['price']),
    ],
    group: {
      by: 'orderKey',
      lines: {
        itemType: 'itemType',
        modelId: 'modelId',
        softwareProductId: 'softwareProductId',
        quantity: 'quantity',
        unitPrice: 'unitPrice',
      },
    },
  },
};

export interface ImportMapping {
  /** field key → CSV column name */
  readonly [field: string]: string | undefined;
}

export interface ImportPreview {
  readonly columns: readonly string[];
  readonly sample: readonly Readonly<Record<string, string>>[];
  readonly total: number;
  readonly fields: readonly ImportField[];
  readonly mapping: ImportMapping;
  /** Set when rows group into documents: the column they group by. */
  readonly groupBy?: string;
}

export interface ImportRowResult {
  readonly line: number;
  readonly status: 'create' | 'update' | 'error' | 'created' | 'updated';
  readonly errors: readonly string[];
  readonly values: Readonly<Record<string, unknown>>;
  readonly id?: string;
}

export interface ImportReport {
  readonly total: number;
  readonly creates: number;
  readonly updates: number;
  readonly errors: number;
  readonly rows: readonly ImportRowResult[];
}

export interface ImportService {
  preview(collection: string, csv: string): ImportPreview;
  validate(
    collection: string,
    csv: string,
    mapping: ImportMapping,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<ImportReport>;
  commit(
    collection: string,
    csv: string,
    mapping: ImportMapping,
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<ImportReport>;
}

export const importServiceToken: ServiceToken<ImportService> =
  createServiceToken<ImportService>('itam/import-service');

/** One record built from the rows that share a group key. */
interface ImportGroupResult {
  readonly key: string;
  readonly header: Record<string, unknown>;
  readonly lines: Record<string, unknown>[];
  readonly lines_of: number[];
}

/**
 * Folds the parsed rows into one record per group key: the first row states
 * the document, every row contributes a line. A row that contradicts the
 * document fails, and a group with any failing row is not written at all —
 * an order missing one of its lines is wrong in a way nobody would notice.
 */
function assemble(
  group: ImportGroup,
  fields: readonly ImportField[],
  rows: ImportRowResult[],
): ImportGroupResult[] {
  const headerFields = fields.filter(
    (field) => field.key !== group.by && !(field.key in group.lines),
  );
  const groups = new Map<string, ImportGroupResult>();
  const errorsOf = new Map<number, string[]>();
  for (const row of rows) {
    const key = asText(row.values[group.by]);
    if (!key) continue;
    const errors: string[] = [];
    const existing = groups.get(key);
    if (existing) {
      // The document's own columns may repeat, but not disagree.
      for (const field of headerFields) {
        const value = row.values[field.key];
        if (value === undefined) continue;
        const stated = existing.header[field.key];
        // Header cells are text, numbers or dates; JSON compares them all.
        if (
          stated !== undefined &&
          JSON.stringify(stated) !== JSON.stringify(value)
        )
          errors.push(
            `${field.key}: differs from the first row of "${key}" (line ${existing.lines_of[0]})`,
          );
      }
      existing.lines.push(lineOf(group, row.values));
      existing.lines_of.push(row.line);
    } else {
      const header: Record<string, unknown> = {};
      for (const field of headerFields) {
        const value = row.values[field.key];
        if (value !== undefined) header[field.key] = value;
        else if (field.required) errors.push(`${field.key}: required`);
      }
      groups.set(key, {
        key,
        header,
        lines: [lineOf(group, row.values)],
        lines_of: [row.line],
      });
    }
    if (errors.length > 0) errorsOf.set(row.line, errors);
  }
  for (const [line, errors] of errorsOf) {
    const index = rows.findIndex((row) => row.line === line);
    const row = rows[index];
    if (row)
      rows[index] = {
        ...row,
        status: 'error',
        errors: [...row.errors, ...errors],
      };
  }
  // A group stands or falls whole.
  for (const entry of groups.values()) {
    const failed = entry.lines_of.find(
      (line) => rows.find((row) => row.line === line)?.status === 'error',
    );
    if (failed === undefined) continue;
    for (const line of entry.lines_of) {
      const index = rows.findIndex((row) => row.line === line);
      const row = rows[index];
      if (!row || row.status === 'error') continue;
      rows[index] = {
        ...row,
        status: 'error',
        errors: [`"${entry.key}" not imported: line ${failed} failed`],
      };
    }
  }
  return [...groups.values()];
}

const lineOf = (
  group: ImportGroup,
  values: Readonly<Record<string, unknown>>,
): Record<string, unknown> => {
  const line: Record<string, unknown> = {};
  for (const [field, key] of Object.entries(group.lines))
    if (values[field] !== undefined) line[key] = values[field];
  return line;
};

const normalise = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9一-鿿]/g, '');

export function createImportService(dependencies: {
  database: DatabaseManager;
  masterData: MasterDataService;
  devices: DeviceService;
  stock: StockService;
  entitlements: EntitlementService;
  procurement: ProcurementService;
}): ImportService {
  const { database, masterData, devices, stock, entitlements, procurement } =
    dependencies;

  const spec = (collection: string): ImportSpec => {
    const found = IMPORT_SPECS[collection];
    if (!found)
      throw new ValidationError(
        `Import is not supported for ${collection}`,
        'collection',
      );
    return found;
  };

  /** name → id (and number → id) for one referenced collection, loaded once per import. */
  const referenceIndex = async (
    collection: string,
  ): Promise<Map<string, string>> => {
    const definition = findItamCollection(collection);
    const columns = ['id', 'name', ...(definition?.searchFields ?? [])].filter(
      (column, index, all) =>
        all.indexOf(column) === index &&
        (definition?.fields ?? []).includes(column),
    );
    const rows = await database
      .query()
      .selectFrom(collection)
      .select(columns)
      .execute<Row>();
    const index = new Map<string, string>();
    for (const row of rows) {
      for (const column of columns) {
        if (column === 'id') continue;
        const value = asText(row[column]);
        if (value) index.set(normalise(value), String(row.id));
      }
      index.set(String(row.id), String(row.id));
    }
    return index;
  };

  const analyse = async (
    collection: string,
    csv: string,
    mapping: ImportMapping,
  ): Promise<{
    rows: ImportRowResult[];
    table: ReturnType<typeof parseCsv>;
    groups?: ImportGroupResult[];
  }> => {
    const { fields, match, defaults, group } = spec(collection);
    // In a grouped file the document's own columns are read from the first
    // row of each group, so a later row may leave them empty; what they
    // require is checked once the group is assembled.
    const perGroup = (key: string) =>
      Boolean(group) && key !== group?.by && !(key in (group?.lines ?? {}));
    const table = parseCsv(csv);
    const references = new Map<string, Map<string, string>>();
    for (const field of fields) {
      if (field.type === 'reference' && field.reference && mapping[field.key])
        references.set(field.key, await referenceIndex(field.reference));
    }
    const existing = new Map<string, string>();
    if (match && match.length > 0) {
      const rows = await database
        .query()
        .selectFrom(collection)
        .select(['id', ...match])
        .execute<Row>();
      for (const row of rows)
        for (const key of match) {
          const value = asText(row[key]);
          if (value) existing.set(`${key}:${normalise(value)}`, String(row.id));
        }
    }
    const seen = new Map<string, number>();
    const results: ImportRowResult[] = [];
    table.rows.forEach((raw, index) => {
      const line = index + 2;
      const errors: string[] = [];
      const values: Record<string, unknown> = { ...defaults };
      for (const field of fields) {
        const column = mapping[field.key];
        const cell = column ? (raw[column] ?? '').trim() : '';
        if (!cell) {
          if (field.required && !perGroup(field.key))
            errors.push(`${field.key}: required`);
          continue;
        }
        switch (field.type) {
          case 'text':
            values[field.key] = cell;
            break;
          case 'number': {
            const parsed = Number(cell.replace(/[, ]/g, ''));
            if (Number.isFinite(parsed)) values[field.key] = parsed;
            else errors.push(`${field.key}: not a number (${cell})`);
            break;
          }
          case 'boolean':
            values[field.key] = ['1', 'true', 'yes', 'y', '是'].includes(
              cell.toLowerCase(),
            );
            break;
          case 'date': {
            const iso = /^\d{4}-\d{2}-\d{2}$/.test(cell)
              ? cell
              : /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(cell)
                ? cell
                    .split('/')
                    .map((part, i) => (i === 0 ? part : part.padStart(2, '0')))
                    .join('-')
                : undefined;
            if (iso) values[field.key] = iso;
            else errors.push(`${field.key}: expected YYYY-MM-DD (${cell})`);
            break;
          }
          case 'enum':
            if (field.options?.includes(cell)) values[field.key] = cell;
            else
              errors.push(
                `${field.key}: expected one of ${(field.options ?? []).join(' / ')} (${cell})`,
              );
            break;
          case 'list': {
            const items = cell
              .split(/[;|,]/)
              .map((item) => item.trim())
              .filter(Boolean);
            const bad = items.filter(
              (item) => field.options && !field.options.includes(item),
            );
            if (bad.length > 0)
              errors.push(`${field.key}: unknown ${bad.join(', ')}`);
            else values[field.key] = items;
            break;
          }
          case 'reference': {
            const id = references.get(field.key)?.get(normalise(cell));
            if (id) values[field.key] = id;
            else
              errors.push(
                `${field.key}: no ${field.reference ?? ''} named "${cell}"`,
              );
            break;
          }
        }
      }
      let existingId: string | undefined;
      for (const key of match ?? []) {
        const value = asText(values[key]);
        if (!value) continue;
        const token = `${key}:${normalise(value)}`;
        const duplicateLine = seen.get(token);
        if (duplicateLine)
          errors.push(`${key}: duplicated in the file (line ${duplicateLine})`);
        seen.set(token, line);
        existingId ??= existing.get(token);
      }
      results.push({
        line,
        status: errors.length > 0 ? 'error' : existingId ? 'update' : 'create',
        errors,
        values,
        id: existingId,
      });
    });
    return {
      rows: results,
      table,
      groups: group ? assemble(group, fields, results) : undefined,
    };
  };

  const summarise = (rows: readonly ImportRowResult[]): ImportReport => ({
    total: rows.length,
    creates: rows.filter(
      (row) => row.status === 'create' || row.status === 'created',
    ).length,
    updates: rows.filter(
      (row) => row.status === 'update' || row.status === 'updated',
    ).length,
    errors: rows.filter((row) => row.status === 'error').length,
    rows,
  });

  const writer = (collection: string) => {
    switch (collection) {
      case 'devices':
        return {
          create: (
            values: Row,
            context: OperationContext,
            conditions: DatabaseAuthorizationConditions,
          ) => devices.create(values, context, conditions),
          update: (
            id: string,
            values: Row,
            context: OperationContext,
            conditions: DatabaseAuthorizationConditions,
          ) => {
            const { modelId: _model, deviceNo: _no, ...rest } = values;
            return devices.update(id, rest, context, conditions);
          },
        };
      case 'stockItems':
        return {
          create: (
            values: Row,
            context: OperationContext,
            conditions: DatabaseAuthorizationConditions,
          ) => stock.create(values, context, conditions),
          update: (
            id: string,
            values: Row,
            context: OperationContext,
            conditions: DatabaseAuthorizationConditions,
          ) => {
            const { kind: _kind, totalQuantity: _total, ...rest } = values;
            return stock.update(id, rest, context, conditions);
          },
        };
      case 'entitlements':
        return {
          create: (
            values: Row,
            context: OperationContext,
            conditions: DatabaseAuthorizationConditions,
          ) => entitlements.create(values, context, conditions),
          update: (
            id: string,
            values: Row,
            context: OperationContext,
            conditions: DatabaseAuthorizationConditions,
          ) => {
            // The kind is fixed once created.
            const { kind: _kind, ...rest } = values;
            return entitlements.update(id, rest, context, conditions);
          },
        };
      default:
        return {
          create: (
            values: Row,
            context: OperationContext,
            conditions: DatabaseAuthorizationConditions,
          ) =>
            masterData.create(collection, values, context.actorId, conditions),
          update: (
            id: string,
            values: Row,
            context: OperationContext,
            conditions: DatabaseAuthorizationConditions,
          ) =>
            masterData.update(
              collection,
              id,
              values,
              context.actorId,
              conditions,
            ),
        };
    }
  };

  /**
   * Writes one document per group: the record first, then its lines. The
   * lines go in with unrestricted conditions because the caller's `create`
   * grant is what the route authorized, and the order being filled is the
   * draft this same call just created.
   */
  const commitGroups = async (
    collection: string,
    rows: readonly ImportRowResult[],
    groups: readonly ImportGroupResult[],
    context: OperationContext,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<ImportRowResult[]> => {
    if (collection !== 'purchaseOrders')
      throw new ValidationError(
        `Grouped import is not implemented for ${collection}`,
        'collection',
      );
    const done = new Map<number, ImportRowResult>(
      rows.map((row) => [row.line, row]),
    );
    for (const entry of groups) {
      if (entry.lines_of.some((line) => done.get(line)?.status === 'error'))
        continue;
      try {
        const order = await procurement.create(
          entry.header,
          context,
          conditions,
        );
        try {
          await procurement.setLines(
            String(order.id),
            entry.lines as unknown as LineInput[],
            context,
            unrestricted('purchaseOrders', 'update'),
          );
        } catch (error) {
          // The order and its lines are one document. The two services
          // commit separately, so an order whose lines were refused is
          // removed again (this call just created it) rather than left
          // behind empty: a group whose row fails is not written at all.
          await procurement
            .delete(
              String(order.id),
              context,
              unrestricted('purchaseOrders', 'delete'),
            )
            .catch(() => undefined);
          throw error;
        }
        for (const line of entry.lines_of) {
          const row = done.get(line);
          if (row)
            done.set(line, {
              ...row,
              status: 'created',
              id: String(order.id),
            });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        for (const line of entry.lines_of) {
          const row = done.get(line);
          if (row)
            done.set(line, { ...row, status: 'error', errors: [message] });
        }
      }
    }
    return [...done.values()].sort((a, b) => a.line - b.line);
  };

  return {
    preview(collection, csv) {
      const { fields, group } = spec(collection);
      const table = parseCsv(csv);
      const mapping: Record<string, string> = {};
      const taken = new Set<string>();
      for (const field of fields) {
        const candidates = [field.key, ...(field.aliases ?? [])].map(normalise);
        const column = table.columns.find(
          (name) => !taken.has(name) && candidates.includes(normalise(name)),
        );
        if (column) {
          mapping[field.key] = column;
          taken.add(column);
        }
      }
      return {
        columns: table.columns,
        sample: table.rows.slice(0, 20),
        total: table.rows.length,
        fields,
        mapping,
        ...(group ? { groupBy: group.by } : {}),
      };
    },

    async validate(collection, csv, mapping, conditions) {
      // Validation reads nothing under the caller's filter; the write step authorizes.
      void conditions;
      const { rows } = await analyse(collection, csv, mapping);
      return summarise(rows);
    },

    async commit(collection, csv, mapping, context, conditions) {
      const { rows, groups } = await analyse(collection, csv, mapping);
      if (groups)
        return summarise(
          await commitGroups(collection, rows, groups, context, conditions),
        );
      const write = writer(collection);
      const done: ImportRowResult[] = [];
      for (const row of rows) {
        if (row.status === 'error') {
          done.push(row);
          continue;
        }
        try {
          if (row.status === 'update' && row.id) {
            await write.update(row.id, row.values, context, conditions);
            done.push({ ...row, status: 'updated' });
          } else {
            const created = await write.create(row.values, context, conditions);
            done.push({ ...row, status: 'created', id: String(created.id) });
          }
        } catch (error) {
          done.push({
            ...row,
            status: 'error',
            errors: [error instanceof Error ? error.message : String(error)],
          });
        }
      }
      return summarise(done);
    },
  };
}
