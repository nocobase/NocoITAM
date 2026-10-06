import type { DatabaseManager } from '@nocobase/db';

import { PO_REASONS, type LineItemType } from './procurement.js';
import { normalizeCode } from './receipt-plan.js';

/**
 * 新建采购单 → AI 整理: the assistant reads what the requester pasted or
 * uploaded (a quote, a colleague's email, a spreadsheet) and hands its
 * reading to the create dialog through the page tool `fillPurchaseOrder`.
 * Nothing it says is taken on its word: the ids it picked are checked to
 * exist, and what it only named — a vendor, a department, a line's part code
 * or product name — is matched here against the master data, by rules the
 * requester can predict. What matches nothing is handed back as unmatched,
 * never forced onto the nearest record. Nothing is saved: the dialog shows
 * the result for the requester to check, complete and save.
 */
export interface CaptureLineInput {
  readonly itemType?: string | null;
  readonly modelId?: string | null;
  readonly softwareProductId?: string | null;
  readonly description?: string | null;
  readonly partCode?: string | null;
  readonly quantity?: number | null;
  readonly unitPrice?: number | null;
  readonly uncertain?: boolean | null;
  readonly source?: string | null;
}

export interface CaptureInput {
  readonly reason?: string | null;
  readonly description?: string | null;
  readonly neededBy?: string | null;
  readonly vendorId?: string | null;
  readonly vendorName?: string | null;
  readonly departmentId?: string | null;
  readonly departmentName?: string | null;
  readonly lines?: readonly CaptureLineInput[];
  readonly uncertain?: readonly string[];
}

export interface CapturedLine {
  readonly itemType: LineItemType;
  readonly modelId: string | null;
  readonly softwareProductId: string | null;
  readonly quantity: number;
  readonly unitPrice: number | null;
  /** The assistant was not sure of the item it picked. */
  readonly uncertain: boolean;
  readonly description: string | null;
}

export interface UnmatchedLine {
  readonly description: string;
  readonly partCode: string | null;
  readonly quantity: number;
  readonly unitPrice: number | null;
  readonly source: string | null;
  /**
   * What the assistant read it as — a software line says `perpetual` or
   * `subscription` — so the dialog offers a software product to pick or
   * create rather than a model. Null when it did not say.
   */
  readonly itemType: LineItemType | null;
}

export interface PurchaseCapture {
  /** The create dialog's header fields, only those the text gave. */
  readonly values: Readonly<Record<string, string>>;
  readonly lines: readonly CapturedLine[];
  readonly unmatched: readonly UnmatchedLine[];
  /** A vendor the text names that is not on the books. */
  readonly vendorName: string | null;
  /** A department the text names that is not on the books. */
  readonly departmentName: string | null;
  /** Header fields filled but not certain (`reason`, `vendorId`, …). */
  readonly uncertain: readonly string[];
}

const HARDWARE = new Set<string>([
  'device',
  'accessory',
  'consumable',
  'component',
]);
const ENTITLEMENT = new Set<string>(['perpetual', 'subscription']);
const KNOWN_TYPES = new Set<string>([...HARDWARE, ...ENTITLEMENT]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** The assistant names the header fields as the form does; refs by their key. */
const UNCERTAIN_KEYS: Readonly<Record<string, string>> = {
  reason: 'reason',
  description: 'description',
  neededBy: 'neededBy',
  vendor: 'vendorId',
  vendorId: 'vendorId',
  department: 'departmentId',
  departmentId: 'departmentId',
};

/** A name as compared: case, spaces and punctuation do not tell two apart. */
export const bareName = (value: string | null | undefined): string =>
  (value ?? '').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');

const clip = (value: string | null | undefined, limit: number): string =>
  (value ?? '').trim().slice(0, limit);

/**
 * The one record a name means: the same name, else the only one whose name
 * contains it or is contained in it. Two candidates are no answer.
 */
export function byName<T extends { readonly id: string; readonly name: string }>(
  rows: readonly T[],
  name: string,
): T | undefined {
  const wanted = bareName(name);
  if (wanted.length < 2) return undefined;
  const same = rows.filter((row) => bareName(row.name) === wanted);
  if (same.length === 1) return same[0];
  if (same.length > 1) return undefined;
  const near = rows.filter((row) => {
    const have = bareName(row.name);
    return have.length >= 2 && (have.includes(wanted) || wanted.includes(have));
  });
  return near.length === 1 ? near[0] : undefined;
}

interface ModelRow {
  readonly id: string;
  readonly name: string;
  readonly code: string | null;
  readonly appliesTo: string;
  readonly manufacturer: string | null;
}

export async function matchPurchaseCapture(
  database: DatabaseManager,
  input: CaptureInput,
): Promise<PurchaseCapture> {
  const query = database.query();
  const [vendors, departments, models, products] = await Promise.all([
    query
      .selectFrom('vendors')
      .select(['id', 'name'])
      .execute<{ id: string; name: string }>(),
    query
      .selectFrom('departments')
      .select(['id', 'name'])
      .execute<{ id: string; name: string }>(),
    query
      .selectFrom('models')
      .innerJoin('categories', 'categories.id', 'models.categoryId')
      .leftJoin('manufacturers', 'manufacturers.id', 'models.manufacturerId')
      .select([
        'models.id as id',
        'models.name as name',
        'models.code as code',
        'categories.appliesTo as appliesTo',
        'manufacturers.name as manufacturer',
      ])
      .execute<ModelRow>(),
    query
      .selectFrom('softwareProducts')
      .select(['id', 'name'])
      .execute<{ id: string; name: string }>(),
  ]);

  const values: Record<string, string> = {};
  const reason = clip(input.reason, 64);
  if ((PO_REASONS as readonly string[]).includes(reason))
    values.reason = reason;
  const description = clip(input.description, 20000);
  if (description) values.description = description;
  const neededBy = clip(input.neededBy, 10);
  if (DATE.test(neededBy)) values.neededBy = neededBy;

  const vendorName = clip(input.vendorName, 255);
  const vendor =
    vendors.find((row) => row.id === input.vendorId) ??
    (vendorName ? byName(vendors, vendorName) : undefined);
  if (vendor) values.vendorId = vendor.id;
  const departmentName = clip(input.departmentName, 255);
  const department =
    departments.find((row) => row.id === input.departmentId) ??
    (departmentName ? byName(departments, departmentName) : undefined);
  if (department) values.departmentId = department.id;

  const lines: CapturedLine[] = [];
  const unmatched: UnmatchedLine[] = [];
  for (const line of (input.lines ?? []).slice(0, 200)) {
    const quantity = Math.min(
      10000,
      Math.max(1, Math.round(Number(line.quantity) || 1)),
    );
    const price = Number(line.unitPrice);
    const unitPrice =
      line.unitPrice !== null &&
      line.unitPrice !== undefined &&
      Number.isFinite(price) &&
      price >= 0
        ? price
        : null;
    const text = clip(line.description, 500);
    const partCode = clip(line.partCode, 128) || null;
    // A part code printed on the document is the surest evidence there is,
    // so it decides before the assistant's own pick; then the pick, when it
    // names a real record; then the name, when exactly one record has it.
    const code = normalizeCode(partCode);
    const coded = code
      ? models.filter((model) => normalizeCode(model.code) === code)
      : [];
    const model =
      (coded.length === 1 ? coded[0] : undefined) ??
      models.find((row) => row.id === line.modelId) ??
      (line.softwareProductId ? undefined : modelByName(models, text));
    const product = model
      ? undefined
      : (products.find((row) => row.id === line.softwareProductId) ??
        byExactName(products, text));
    if (model && HARDWARE.has(model.appliesTo))
      lines.push({
        itemType: model.appliesTo as LineItemType,
        modelId: model.id,
        softwareProductId: null,
        quantity,
        unitPrice,
        uncertain: Boolean(line.uncertain),
        description: text || null,
      });
    else if (product)
      lines.push({
        // A product is bought for good or by subscription; the text says
        // which, and a subscription is the common case when it does not.
        itemType: (ENTITLEMENT.has(clip(line.itemType, 32))
          ? clip(line.itemType, 32)
          : 'subscription') as LineItemType,
        modelId: null,
        softwareProductId: product.id,
        quantity,
        unitPrice,
        uncertain: Boolean(line.uncertain),
        description: text || null,
      });
    else if (text || partCode)
      unmatched.push({
        description: text || partCode || '',
        partCode,
        quantity,
        unitPrice,
        source: clip(line.source, 200) || null,
        itemType: KNOWN_TYPES.has(clip(line.itemType, 32))
          ? (clip(line.itemType, 32) as LineItemType)
          : null,
      });
  }

  const filled = new Set(Object.keys(values));
  return {
    values,
    lines,
    unmatched,
    vendorName: vendor || !vendorName ? null : vendorName,
    departmentName: department || !departmentName ? null : departmentName,
    uncertain: [
      ...new Set(
        (input.uncertain ?? [])
          .map((key) => UNCERTAIN_KEYS[key])
          .filter((key): key is string => Boolean(key) && filled.has(key)),
      ),
    ],
  };
}

/** Only an identical name counts for a product: names are unique. */
function byExactName<T extends { readonly id: string; readonly name: string }>(
  rows: readonly T[],
  name: string,
): T | undefined {
  const wanted = bareName(name);
  if (!wanted) return undefined;
  const same = rows.filter((row) => bareName(row.name) === wanted);
  return same.length === 1 ? same[0] : undefined;
}

/**
 * A model by its name, with or without its maker in front ("Apple MacBook
 * Pro 14 (M3)"). Only an identical name counts: "MacBook Pro 14 M4" must not
 * become the M3 the books happen to hold.
 */
function modelByName(
  models: readonly ModelRow[],
  name: string,
): ModelRow | undefined {
  const wanted = bareName(name);
  if (!wanted) return undefined;
  const same = models.filter(
    (model) =>
      bareName(model.name) === wanted ||
      bareName(`${model.manufacturer ?? ''}${model.name}`) === wanted,
  );
  return same.length === 1 ? same[0] : undefined;
}
