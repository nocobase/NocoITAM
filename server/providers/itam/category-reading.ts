import type { ServiceContainer } from '@nocobase/service-provider';

import { scopeFor } from './ai-bridge.js';
import { asText, type Row } from './collection-query.js';
import { createDomainAccess } from './domains.js';
import { BusinessRuleError } from './errors.js';

/**
 * What the AI readings of a category work from (2026-10-20): 建议字段 on an
 * existing category (`categoryFields`) and AI 整理 of a new one
 * (`category`). Both read the categories as the person, each with its path,
 * kind, rules, defaults and extended fields, so a suggestion keeps to the
 * keys and values similar categories use; and the new category's reading is
 * checked here before the form takes it.
 */

/** The rules and defaults a category's new records start with. */
export const CATEGORY_SETTING_KEYS = [
  'requiresSerial',
  'assignableToPerson',
  'depreciationMethod',
  'usefulLifeMonths',
  'residualRate',
  'warrantyMonths',
  'replacementMonths',
  'auditCycleDays',
] as const;

const APPLIES_TO = [
  'device',
  'accessory',
  'consumable',
  'component',
  'entitlement',
] as const;

interface Book {
  readonly rows: readonly Row[];
  readonly byId: ReadonlyMap<string, Row>;
  readonly path: (row: Row) => string;
  readonly fieldsOf: (row: Row) => Row[];
  readonly settingsOf: (row: Row) => Record<string, unknown>;
}

/** Every category the person may read, with what a reading needs of each. */
async function categoryBook(
  container: ServiceContainer,
  actorId: string,
): Promise<Book> {
  const conditions = await scopeFor(container, actorId).may(
    'categories',
    'read',
  );
  if (!conditions)
    throw new BusinessRuleError('Not allowed to read categories', 'FORBIDDEN');
  const rows = (
    await createDomainAccess(container).list(
      'categories',
      { pageSize: 500, sort: 'sort' },
      conditions,
    )
  ).data;
  const byId = new Map(rows.map((row) => [String(row.id), row]));
  const path = (row: Row): string => {
    const names: string[] = [];
    for (
      let at: Row | undefined = row;
      at && names.length < 10;
      at = byId.get(asText(at.parentId) ?? '')
    )
      names.unshift(asText(at.name) ?? '');
    return names.join(' / ');
  };
  const templateOf = (value: unknown): Row[] => {
    if (typeof value === 'string')
      try {
        return templateOf(JSON.parse(value));
      } catch {
        return [];
      }
    return Array.isArray(value) ? (value as Row[]) : [];
  };
  return {
    rows,
    byId,
    path,
    fieldsOf: (row) =>
      templateOf(row.fieldTemplate).map((field: Row) => ({
        key: field.key,
        label: field.label,
        type: field.type,
        ...(Array.isArray(field.options) ? { options: field.options } : {}),
      })),
    settingsOf: (row) =>
      Object.fromEntries(
        CATEGORY_SETTING_KEYS.flatMap((key) =>
          row[key] === null || row[key] === undefined ? [] : [[key, row[key]]],
        ),
      ),
  };
}

/** 建议字段: the category, and the others of its kind. */
export async function categoryFieldFacts(
  container: ServiceContainer,
  actorId: string,
  categoryId: string,
  /** The fields as the reader's editor holds them, unsaved ones too. */
  editing?: unknown,
): Promise<Record<string, unknown>> {
  const book = await categoryBook(container, actorId);
  const category = book.byId.get(categoryId);
  if (!category) throw new BusinessRuleError('Category not found', 'NOT_FOUND');
  return {
    category: {
      name: category.name,
      path: book.path(category),
      appliesTo: category.appliesTo,
      currentFields: Array.isArray(editing)
        ? templateFields(editing)
        : book.fieldsOf(category),
      currentDefaults: book.settingsOf(category),
    },
    otherCategories: book.rows
      .filter(
        (row) =>
          row.id !== categoryId &&
          row.appliesTo === category.appliesTo &&
          (book.fieldsOf(row).length > 0 || row.parentId),
      )
      .slice(0, 20)
      .map((row) => ({
        path: book.path(row),
        fields: book.fieldsOf(row),
        defaults: book.settingsOf(row),
      })),
  };
}

/** AI 整理 of a new category: every category, and the parent when chosen. */
export async function newCategoryFacts(
  container: ServiceContainer,
  actorId: string,
  parentId: string | null,
): Promise<Record<string, unknown>> {
  const book = await categoryBook(container, actorId);
  const parent = parentId ? book.byId.get(parentId) : undefined;
  return {
    ...(parent
      ? {
          parent: {
            id: parent.id,
            path: book.path(parent),
            appliesTo: parent.appliesTo,
          },
        }
      : {}),
    categories: book.rows.slice(0, 80).map((row) => ({
      id: row.id,
      path: book.path(row),
      appliesTo: row.appliesTo,
      ...book.settingsOf(row),
      fields: book.fieldsOf(row),
    })),
  };
}

const isKey = (key: unknown): key is string =>
  typeof key === 'string' && /^[A-Za-z][A-Za-z0-9_]*$/.test(key);
const TYPES = ['text', 'number', 'date', 'select', 'boolean'];

/** Extended fields as a template takes them: valid, unique keys only. */
export function templateFields(value: unknown): Row[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((entry: Row) => {
    const key = entry?.key;
    const label = asText(entry?.label)?.trim();
    if (!isKey(key) || !label || seen.has(key)) return [];
    seen.add(key);
    const type = TYPES.includes(String(entry.type)) ? entry.type : 'text';
    const options = Array.isArray(entry.options)
      ? entry.options.map(String).filter(Boolean)
      : [];
    if (type === 'select' && options.length === 0) return [];
    return [
      {
        key,
        label,
        type,
        ...(entry.required === true ? { required: true } : {}),
        ...(type === 'select' ? { options } : {}),
      },
    ];
  });
}

/**
 * A new category's reading as the form takes it: a parent that exists, the
 * kind a parent fixes, rules and defaults within their bounds, a template
 * the editor accepts, and the categories already called the same.
 */
export async function checkCategoryReading(
  container: ServiceContainer,
  actorId: string,
  reading: Record<string, unknown>,
  /** 完善: the category being improved, which is no duplicate of itself. */
  self: string | null = null,
): Promise<Record<string, unknown>> {
  const book = await categoryBook(container, actorId);
  // The form's fields by key (2026-10-30, the form-capture skill).
  const read = (reading.values ?? {}) as Record<string, unknown>;
  const values: Record<string, unknown> = {};
  const name = asText(read.name)?.trim();
  if (name) values.name = name;
  // A category is never its own parent.
  const parentId = asText(read.parentId) ?? '';
  const parent = parentId === self ? undefined : book.byId.get(parentId);
  if (parent) {
    values.parentId = parent.id;
    values.appliesTo = parent.appliesTo;
  } else if (APPLIES_TO.includes(read.appliesTo as never))
    values.appliesTo = read.appliesTo;
  for (const key of ['requiresSerial', 'assignableToPerson'] as const)
    if (typeof read[key] === 'boolean') values[key] = read[key];
  if (
    read.depreciationMethod === 'none' ||
    read.depreciationMethod === 'straightLine'
  )
    values.depreciationMethod = read.depreciationMethod;
  for (const key of [
    'usefulLifeMonths',
    'warrantyMonths',
    'replacementMonths',
    'auditCycleDays',
  ] as const) {
    const number = Number(read[key]);
    if (
      read[key] !== null &&
      read[key] !== undefined &&
      Number.isFinite(number) &&
      number >= 0
    )
      values[key] = Math.round(number);
  }
  const rate = Number(read.residualRate);
  if (
    read.residualRate !== null &&
    read.residualRate !== undefined &&
    rate >= 0 &&
    rate <= 1
  )
    values.residualRate = rate;
  const same = (text: unknown) =>
    (asText(text) ?? '').replace(/\s+/g, '').toLowerCase();
  return {
    values,
    fieldTemplate: templateFields(reading.fieldTemplate),
    uncertain: Array.isArray(reading.uncertain)
      ? reading.uncertain.filter((key) => typeof key === 'string')
      : [],
    duplicates: name
      ? book.rows
          .filter((row) => row.id !== self && same(row.name) === same(name))
          .map((row) => ({ id: row.id, name: book.path(row) }))
      : [],
  };
}
