import type { DatabaseManager } from '@nocobase/db';

import { bareName, byName } from './purchase-capture.js';
import { normalizeCode } from './receipt-plan.js';

/**
 * 新建型号 / 新建软件产品 → AI 整理 (2026-10-06): the reader types what they
 * know — a maker and a model, often no more — and the assistant looks the
 * rest up on the web and hands its reading to the create dialog through a
 * page tool. As with a purchase order's AI 整理, nothing it says is taken on
 * its word: the category it picked must exist and be of the right kind, the
 * maker it named is matched against the manufacturers by name and never
 * created, every value is held to what the field accepts, and a record of
 * the same part code or name already on the books is pointed out so it is
 * not entered twice. Nothing is saved: the dialog shows the result for the
 * reader to check and save.
 */
export type MasterCaptureCollection = 'models' | 'softwareProducts';

export const MASTER_CAPTURE_COLLECTIONS: readonly MasterCaptureCollection[] = [
  'models',
  'softwareProducts',
];

export interface MasterCaptureSource {
  readonly title: string;
  readonly url: string;
}

export interface MasterCaptureInput {
  readonly name?: string | null;
  readonly code?: string | null;
  readonly manufacturerName?: string | null;
  readonly categoryId?: string | null;
  readonly specification?: string | null;
  readonly warrantyMonths?: number | null;
  readonly releaseDate?: string | null;
  readonly eolDate?: string | null;
  readonly eosDate?: string | null;
  readonly deliveryMethod?: string | null;
  readonly description?: string | null;
  readonly website?: string | null;
  /** A model's extended fields kept on the model, by template key. */
  readonly attributes?: Readonly<Record<string, unknown>> | null;
  readonly uncertain?: readonly string[] | null;
  readonly sources?:
    | readonly {
        readonly title?: string | null;
        readonly url?: string | null;
      }[]
    | null;
}

export interface MasterCapture {
  /**
   * The create dialog's fields, only those the reading gave and that hold;
   * a model's extended fields under `attributes`.
   */
  readonly values: Readonly<Record<string, unknown>>;
  /** A maker the reading names that is not among the manufacturers. */
  readonly manufacturerName: string | null;
  /** Records already on the books under the same part code or name. */
  readonly duplicates: readonly {
    readonly id: string;
    readonly name: string;
  }[];
  /** Fields filled but not certain, by the form's keys (`attributes.<key>`). */
  readonly uncertain: readonly string[];
  /** The web pages the reading cites, links only. */
  readonly sources: readonly MasterCaptureSource[];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DELIVERY_METHODS = new Set(['onPremise', 'saas', 'both']);
/** A model is hardware or stock; a software product is an entitlement's. */
const KINDS: Readonly<
  Record<MasterCaptureCollection, (kind: string) => boolean>
> = {
  models: (kind) => kind !== 'entitlement',
  softwareProducts: (kind) => kind === 'entitlement',
};
/** What each dialog asks, so an uncertain key it does not show is dropped. */
const FIELDS: Readonly<Record<MasterCaptureCollection, readonly string[]>> = {
  models: [
    'name',
    'code',
    'manufacturerId',
    'categoryId',
    'specification',
    'warrantyMonths',
    'releaseDate',
    'eolDate',
    'eosDate',
  ],
  softwareProducts: [
    'name',
    'manufacturerId',
    'categoryId',
    'deliveryMethod',
    'description',
    'website',
  ],
};
/** The assistant may name a reference by what it is rather than its key. */
const UNCERTAIN_ALIASES: Readonly<Record<string, string>> = {
  manufacturer: 'manufacturerId',
  manufacturerName: 'manufacturerId',
  category: 'categoryId',
};

const clip = (value: string | null | undefined, limit: number): string =>
  (value ?? '').trim().slice(0, limit);

/** A calendar date that exists, as `YYYY-MM-DD`; anything else is nothing. */
function calendarDate(value: string | null | undefined): string | undefined {
  const date = clip(value, 10);
  if (!DATE.test(date)) return undefined;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date
    ? date
    : undefined;
}

/** An address a reader may open: http or https, nothing else. */
function webAddress(value: string | null | undefined): string | undefined {
  const raw = clip(value, 500);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

export async function matchMasterCapture(
  database: DatabaseManager,
  collection: MasterCaptureCollection,
  input: MasterCaptureInput,
): Promise<MasterCapture> {
  const query = database.query();
  const [manufacturers, categories] = await Promise.all([
    query
      .selectFrom('manufacturers')
      .select(['id', 'name'])
      .execute<{ id: string; name: string }>(),
    query
      .selectFrom('categories')
      .select(['id', 'appliesTo', 'fieldTemplate'])
      .execute<{ id: string; appliesTo: string; fieldTemplate: unknown }>(),
  ]);

  const values: Record<string, unknown> = {};
  const name = clip(input.name, 255);
  if (name) values.name = name;

  const manufacturerName = clip(input.manufacturerName, 255);
  const manufacturer = manufacturerName
    ? byName(manufacturers, manufacturerName)
    : undefined;
  if (manufacturer) values.manufacturerId = manufacturer.id;

  const category = categories.find((row) => row.id === input.categoryId);
  if (category && KINDS[collection](category.appliesTo))
    values.categoryId = category.id;

  if (collection === 'models') {
    const code = clip(input.code, 255);
    if (code) values.code = code;
    const specification = clip(input.specification, 20000);
    if (specification) values.specification = specification;
    const months = Number(input.warrantyMonths);
    if (
      input.warrantyMonths !== null &&
      input.warrantyMonths !== undefined &&
      Number.isInteger(months) &&
      months > 0 &&
      months <= 240
    )
      values.warrantyMonths = months;
    for (const key of ['releaseDate', 'eolDate', 'eosDate'] as const) {
      const date = calendarDate(input[key]);
      if (date) values[key] = date;
    }
    // Only the fields the chosen category keeps on the model, each held to
    // its type: an answer a field would refuse is no answer.
    const attributes: Record<string, unknown> = {};
    for (const field of category && values.categoryId
      ? modelFields(category.fieldTemplate)
      : []) {
      const value = fieldValue(field, input.attributes?.[field.key]);
      if (value !== undefined) attributes[field.key] = value;
    }
    if (Object.keys(attributes).length > 0) values.attributes = attributes;
  } else {
    const delivery = clip(input.deliveryMethod, 32);
    if (DELIVERY_METHODS.has(delivery)) values.deliveryMethod = delivery;
    const description = clip(input.description, 20000);
    if (description) values.description = description;
    const website = webAddress(input.website);
    if (website) values.website = website;
  }

  const filledAttributes = Object.keys(
    (values.attributes as Record<string, unknown> | undefined) ?? {},
  );
  const filled = new Set([
    ...Object.keys(values),
    ...filledAttributes.map((key) => `attributes.${key}`),
  ]);
  const asked = new Set([
    ...FIELDS[collection],
    ...filledAttributes.map((key) => `attributes.${key}`),
  ]);
  const uncertain = [
    ...new Set(
      (input.uncertain ?? [])
        .map(
          (key) =>
            UNCERTAIN_ALIASES[key] ??
            // An extended field named by its bare key.
            (filledAttributes.includes(key) ? `attributes.${key}` : key),
        )
        .filter((key) => asked.has(key) && filled.has(key)),
    ),
  ];

  const seen = new Set<string>();
  const sources: MasterCaptureSource[] = [];
  for (const source of input.sources ?? []) {
    const url = webAddress(source.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    sources.push({ title: clip(source.title, 200) || url, url });
    if (sources.length === 8) break;
  }

  return {
    values,
    manufacturerName:
      manufacturer || !manufacturerName ? null : manufacturerName,
    duplicates: await duplicatesOf(database, collection, {
      name,
      code: typeof values.code === 'string' ? values.code : '',
      maker: manufacturer?.name ?? manufacturerName,
    }),
    uncertain,
    sources,
  };
}

interface TemplateEntry {
  readonly key: string;
  readonly type: string;
  readonly options?: readonly string[];
}

/** The template fields a category keeps on the model. */
function modelFields(template: unknown): TemplateEntry[] {
  const parsed: unknown =
    typeof template === 'string' ? safeParse(template) : template;
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return [];
    const field = entry as Record<string, unknown>;
    return field.scope === 'model' &&
      !field.hidden &&
      typeof field.key === 'string' &&
      typeof field.type === 'string'
      ? [
          {
            key: field.key,
            type: field.type,
            options: Array.isArray(field.options)
              ? field.options.map(String)
              : undefined,
          },
        ]
      : [];
  });
}

const safeParse = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

/** A value as the field's type takes it, or undefined for none. */
function fieldValue(field: TemplateEntry, raw: unknown): unknown {
  if (raw === undefined || raw === null || raw === '') return undefined;
  // Only a scalar is an answer; an object or a list is none.
  const scalar =
    typeof raw === 'string' || typeof raw === 'number' ? String(raw) : '';
  switch (field.type) {
    case 'number': {
      const value =
        typeof raw === 'number' ? raw : Number(scalar.trim() || NaN);
      return Number.isFinite(value) ? value : undefined;
    }
    case 'boolean':
      if (raw === true || raw === 'true') return true;
      if (raw === false || raw === 'false') return false;
      return undefined;
    case 'date':
      return typeof raw === 'string' ? calendarDate(raw) : undefined;
    case 'select': {
      // One of its options, however it was spaced or cased.
      const wanted = bareName(scalar);
      if (!wanted) return undefined;
      return (field.options ?? []).find(
        (option) => bareName(option) === wanted,
      );
    }
    default: {
      return clip(scalar, 255) || undefined;
    }
  }
}

/**
 * Records the books already hold for what was read: a model with the same
 * part code, or the same name with or without its maker in front; a product
 * with the same name. The reader decides — it may be the record they wanted.
 */
async function duplicatesOf(
  database: DatabaseManager,
  collection: MasterCaptureCollection,
  read: {
    readonly name: string;
    readonly code: string;
    readonly maker: string;
  },
): Promise<{ id: string; name: string }[]> {
  const name = bareName(read.name);
  const code = normalizeCode(read.code);
  if (!name && !code) return [];
  if (collection === 'softwareProducts') {
    const products = await database
      .query()
      .selectFrom('softwareProducts')
      .select(['id', 'name'])
      .execute<{ id: string; name: string }>();
    return products
      .filter((row) => bareName(row.name) === name)
      .slice(0, 5)
      .map((row) => ({ id: row.id, name: row.name }));
  }
  const models = await database
    .query()
    .selectFrom('models')
    .leftJoin('manufacturers', 'manufacturers.id', 'models.manufacturerId')
    .select([
      'models.id as id',
      'models.name as name',
      'models.code as code',
      'manufacturers.name as manufacturer',
    ])
    .execute<{
      id: string;
      name: string;
      code: string | null;
      manufacturer: string | null;
    }>();
  const named = (row: { name: string; manufacturer: string | null }) => {
    if (!name) return false;
    const own = bareName(row.name);
    return (
      own === name ||
      bareName(`${row.manufacturer ?? ''}${row.name}`) === name ||
      own === bareName(`${read.maker}${read.name}`)
    );
  };
  return models
    .filter((row) => (code && normalizeCode(row.code) === code) || named(row))
    .slice(0, 5)
    .map((row) => ({ id: row.id, name: row.name }));
}
