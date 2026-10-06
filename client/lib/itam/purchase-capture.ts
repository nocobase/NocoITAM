import { LINE_ITEM_TYPES, type LineItemType } from './procurement.js';
import type { PurchaseLineDraft } from './purchase-lines.js';

/**
 * AI 整理 in the new purchase order dialog: what the assistant hands the
 * dialog (`fillPurchaseOrder`), and what the server makes of it
 * (`POST /itam/purchase-orders/capture/match`, `purchase-capture.ts`).
 */
export interface PurchaseCapture {
  readonly values: Readonly<Record<string, string>>;
  readonly lines: readonly {
    readonly itemType: LineItemType;
    readonly modelId: string | null;
    readonly softwareProductId: string | null;
    readonly quantity: number;
    readonly unitPrice: number | null;
    readonly uncertain: boolean;
    readonly description: string | null;
  }[];
  readonly unmatched: readonly {
    readonly description: string;
    readonly partCode: string | null;
    readonly quantity: number;
    readonly unitPrice: number | null;
    readonly source: string | null;
    /** `perpetual` / `subscription` for software, as the assistant read it. */
    readonly itemType: LineItemType | null;
    /** The dialog's own handle on the row, so placing one keeps the rest. */
    readonly key?: string;
  }[];
  readonly vendorName: string | null;
  readonly departmentName: string | null;
  readonly uncertain: readonly string[];
}

/** The header fields AI 整理 fills; 负责人 stays whoever the dialog has. */
export const CAPTURED_FIELDS = [
  'reason',
  'description',
  'departmentId',
  'neededBy',
  'vendorId',
] as const;

const clip = (value: unknown, length: number): string | null => {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim().slice(0, length);
  return text || null;
};

const amount = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const number =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value.replace(/[,\s，]/g, ''))
        : Number.NaN;
  return Number.isFinite(number) && number >= 0 ? number : null;
};

/**
 * The assistant's arguments as the server takes them. It supplies them, so
 * they are read defensively and only the keys the endpoint's strict schema
 * knows are sent.
 */
export function captureArgs(args: unknown): Record<string, unknown> {
  const input = (args ?? {}) as Record<string, unknown>;
  const lines = (Array.isArray(input.lines) ? input.lines : [])
    .slice(0, 200)
    .map((value: unknown) => {
      const line = (value ?? {}) as Record<string, unknown>;
      const quantity = amount(line.quantity);
      return {
        itemType: clip(line.itemType, 32),
        modelId: clip(line.modelId, 64),
        softwareProductId: clip(line.softwareProductId, 64),
        description: clip(line.description, 500),
        partCode: clip(line.partCode, 128),
        quantity: quantity === null ? null : Math.min(10000, quantity),
        unitPrice: amount(line.unitPrice),
        uncertain: line.uncertain === true,
        source: clip(line.source, 200),
      };
    });
  return {
    reason: clip(input.reason, 64),
    description: clip(input.description, 20000),
    neededBy: clip(input.neededBy, 32),
    vendorId: clip(input.vendorId, 64),
    vendorName: clip(input.vendorName, 255),
    departmentId: clip(input.departmentId, 64),
    departmentName: clip(input.departmentName, 255),
    uncertain: (Array.isArray(input.uncertain) ? input.uncertain : [])
      .map((key: unknown) => clip(key, 64))
      .filter((key): key is string => Boolean(key))
      .slice(0, 20),
    lines,
  };
}

/**
 * The dialog's values once a capture is applied. The header fields AI 整理
 * fills are replaced by what it read — an adjustment returns the whole
 * order, so a field it left out is one it cleared — and every other value
 * (负责人) is kept.
 */
export function applyCaptureValues(
  current: Readonly<Record<string, unknown>>,
  capture: PurchaseCapture,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...current };
  for (const key of CAPTURED_FIELDS) delete next[key];
  return { ...next, ...capture.values };
}

/** A captured line as the dialog edits it. */
export function captureLine(
  line: PurchaseCapture['lines'][number],
): PurchaseLineDraft & { readonly uncertain: boolean } {
  return {
    key: crypto.randomUUID(),
    itemType: (LINE_ITEM_TYPES as readonly string[]).includes(line.itemType)
      ? line.itemType
      : 'device',
    modelId: line.modelId,
    softwareProductId: line.softwareProductId,
    quantity: line.quantity,
    unitPrice: line.unitPrice === null ? '' : String(line.unitPrice),
    receivedQuantity: 0,
    uncertain: line.uncertain,
  };
}

/** The captured lines as the dialog edits them. */
export function captureLines(
  capture: PurchaseCapture,
): (PurchaseLineDraft & { readonly uncertain: boolean })[] {
  return capture.lines.map(captureLine);
}

/** A row nobody has filled in: the blank line the form opens on. */
export function blankLine(line: PurchaseLineDraft): boolean {
  return !line.modelId && !line.softwareProductId && line.unitPrice === '';
}

/** Each unmatched row with a handle of its own, kept once it has one. */
export function keyedUnmatched(
  unmatched: PurchaseCapture['unmatched'],
): PurchaseCapture['unmatched'] {
  return unmatched.map((line) =>
    line.key ? line : { ...line, key: crypto.randomUUID() },
  );
}

/** A capacity, a size or a speed: how the item is configured, not which. */
const SPEC_WORD =
  /^\d+(?:\.\d+)?\s*(?:gb|tb|mb|g|t|m|寸|英寸|"|inch|in|w|hz|ghz|mhz|核|c|nm|mah|ml|l)$/iu;

/** A word with a Latin letter or a digit in it: how the books name models. */
const NAMED = /[A-Za-z0-9]/;

/**
 * What an unmatched line's picker searches for first: the document's own
 * wording without the configuration (16GB/512GB, 27英寸), since a list search
 * wants every word and a model is named without those — nor, when there are
 * other words, the Chinese that only says what kind of thing it is
 * (显示器, 笔记本内存), which no model name carries (2026-10-06).
 */
export function pickerSearch(description: string): string {
  const words = description
    .split(/[\s/,，、()（）]+/u)
    .filter((word) => word && !SPEC_WORD.test(word));
  const named = words.filter((word) => NAMED.test(word));
  return (named.length > 0 ? named : words).join(' ');
}

/**
 * The searches an unmatched line's picker tries in turn until one finds a
 * record: its wording, then each word that looks like a model number
 * (letters and digits together, longest first), then its part code. Found
 * testing 2026-10-06: "Crucial DDR5-5600 32GB 笔记本内存" opened on a list
 * with nothing in it.
 */
export function pickerSearches(
  description: string,
  partCode: string | null,
): string[] {
  const first = pickerSearch(description);
  const numbers = first
    .split(' ')
    .filter(
      (word) => word.length >= 3 && /[A-Za-z]/.test(word) && /\d/.test(word),
    )
    .sort((a, b) => b.length - a.length);
  return [
    ...new Set([first, ...numbers, ...(partCode ? [partCode] : [])]),
  ].filter(Boolean);
}
