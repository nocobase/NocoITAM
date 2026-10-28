/**
 * The rule layer under receiving by delivery document. The assistant reads
 * the document and proposes, row by row, what arrived and on which order
 * line (`ReceiptDraft`); everything that can be decided without a model is
 * decided here, the same way every time:
 *
 * - a row whose part code is a line's model code goes to that line, whatever
 *   the assistant guessed — a rule match beats a judgement;
 * - every kind of line is planned: a device line by its units, the rest by
 *   a quantity (a subscription's seats are as much a count as a box of mice);
 * - quantities are checked against what the line still has outstanding, and
 *   serials against each other and against the register.
 *
 * Pure functions: the service supplies the order's lines and the serials
 * already on the books, so the rules are unit tested without a database.
 */

import { addMonths } from './dates.js';

/** One item row as the assistant read it from the document. */
export interface DocumentRow {
  /** The order line the assistant matched it to, or null when it could not. */
  readonly lineId: string | null;
  /** The row's own wording, as printed. */
  readonly description: string;
  readonly partCode?: string | null;
  readonly quantity: number;
  readonly serialNos?: readonly string[];
  /** Where it is in the document ("Sheet1 row 4", "page 2, line 3"). */
  readonly source?: string | null;
  /** A warranty the document states for the row: a period ("36 个月"). */
  readonly warrantyMonths?: number | null;
  /** …or an end date it prints. */
  readonly warrantyEndDate?: string | null;
}

/** What the assistant hands over (the `prefillReceipt` page tool). */
export interface ReceiptDraft {
  readonly deliveryNo?: string | null;
  readonly deliveryDate?: string | null;
  readonly vendorName?: string | null;
  readonly rows: readonly DocumentRow[];
  readonly notes?: string | null;
}

/** An order line as the rules need it. */
export interface PlanLine {
  readonly id: string;
  readonly itemType: string;
  /** The model's manufacturer part code (`models.code`). */
  readonly modelCode: string | null;
  readonly outstanding: number;
  /** The device category requires a serial (`categories.requiresSerial`). */
  readonly requiresSerial: boolean;
}

export interface PlannedUnit {
  readonly serialNo: string;
  /** Where in the document it came from; absent for one typed by hand. */
  readonly source?: string;
}

export interface PlannedLine {
  readonly lineId: string;
  readonly quantity: number;
  /** Devices: one entry per unit, its serial possibly empty. */
  readonly units: readonly PlannedUnit[];
  /** How each contributing row was matched. */
  readonly matchedBy: readonly ('partCode' | 'assistant')[];
  readonly sources: readonly string[];
  /** Devices: the warranty end the document states, as a date. */
  readonly warrantyEndDate?: string;
  readonly warrantySource?: string;
}

export type ReceiptIssueCode =
  | 'unmatched'
  | 'matchConflict'
  | 'shortDelivery'
  | 'serialCount'
  | 'overReceipt'
  | 'duplicateInBatch'
  | 'duplicateInRegister'
  | 'serialRequired';

export interface ReceiptIssue {
  readonly code: ReceiptIssueCode;
  /** A blocking issue keeps the batch from being saved. */
  readonly blocking: boolean;
  readonly lineId?: string;
  readonly serialNo?: string;
  readonly description?: string;
  readonly source?: string;
  readonly expected?: number;
  readonly actual?: number;
}

export interface ReceiptPlan {
  readonly header: {
    readonly deliveryNo: string | null;
    readonly deliveryDate: string | null;
    readonly vendorName: string | null;
  };
  readonly lines: readonly PlannedLine[];
  readonly issues: readonly ReceiptIssue[];
}

/** What the batch form sends for one line. */
export interface BatchLine {
  readonly lineId: string;
  readonly quantity: number;
  /** Devices: one per unit, empty where the unit has none. */
  readonly serialNos?: readonly string[];
}

const BLOCKING: ReadonlySet<ReceiptIssueCode> = new Set([
  'overReceipt',
  'duplicateInBatch',
  'duplicateInRegister',
  'serialRequired',
]);

const issue = (
  code: ReceiptIssueCode,
  details: Omit<ReceiptIssue, 'code' | 'blocking'> = {},
): ReceiptIssue => ({ code, blocking: BLOCKING.has(code), ...details });

/**
 * A part code as it compares: case, spaces and the punctuation vendors put
 * between its parts vary from one document to the next ("MRX63CH/A",
 * "mrx63ch-a"), the code does not.
 */
export const normalizeCode = (code: string | null | undefined): string =>
  (code ?? '').toUpperCase().replace(/[\s\-_/.]/g, '');

const clean = (serials: readonly string[] | undefined): string[] =>
  (serials ?? []).map((serial) => serial.trim()).filter(Boolean);

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (value: string | null | undefined): value is string =>
  Boolean(value && DATE.test(value) && !Number.isNaN(Date.parse(value)));

/**
 * The warranty end a document states for a row: its printed date, or its
 * period counted from `start` (2026-10-06 — a note that says 保修 36 个月
 * left the field empty, so the receiver could not see it had been read).
 */
function warrantyEnd(row: DocumentRow, start: string): string | undefined {
  const printed = row.warrantyEndDate?.trim();
  if (isDate(printed)) return printed;
  const months = Number(row.warrantyMonths);
  return start && Number.isInteger(months) && months > 0 && months <= 240
    ? addMonths(start, months)
    : undefined;
}

/**
 * Turns the assistant's rows into a plan the batch form opens on. `today`
 * dates a stated warranty period when the document prints no delivery date.
 */
export function planReceipt(
  draft: ReceiptDraft,
  lines: readonly PlanLine[],
  today = '',
): ReceiptPlan {
  const issues: ReceiptIssue[] = [];
  const delivered = draft.deliveryDate?.trim();
  const start = isDate(delivered) ? delivered : today;
  const byId = new Map(lines.map((line) => [line.id, line]));
  const byCode = new Map<string, PlanLine[]>();
  for (const line of lines) {
    const code = normalizeCode(line.modelCode);
    if (!code) continue;
    byCode.set(code, [...(byCode.get(code) ?? []), line]);
  }
  const planned = new Map<
    string,
    {
      quantity: number;
      units: PlannedUnit[];
      matchedBy: ('partCode' | 'assistant')[];
      sources: string[];
      warrantyEndDate?: string;
      warrantySource?: string;
    }
  >();

  for (const row of draft.rows) {
    const source = row.source?.trim() || undefined;
    const description = row.description.trim();
    const coded = byCode.get(normalizeCode(row.partCode));
    // Only an unambiguous code decides: two lines of the same model leave
    // the choice to the assistant.
    const ruled = coded?.length === 1 ? coded[0] : undefined;
    const guessed = row.lineId ? byId.get(row.lineId) : undefined;
    if (ruled && guessed && ruled.id !== guessed.id)
      issues.push(
        issue('matchConflict', { lineId: ruled.id, description, source }),
      );
    const line = ruled ?? guessed;
    if (!line) {
      issues.push(issue('unmatched', { description, source }));
      continue;
    }
    const serials = clean(row.serialNos);
    const quantity = Math.max(
      Number.isFinite(row.quantity) ? Math.floor(row.quantity) : 0,
      line.itemType === 'device' ? serials.length : 0,
    );
    if (quantity < 1) continue;
    if (line.itemType === 'device' && serials.length !== quantity)
      issues.push(
        issue('serialCount', {
          lineId: line.id,
          description,
          source,
          expected: quantity,
          actual: serials.length,
        }),
      );
    const entry = planned.get(line.id) ?? {
      quantity: 0,
      units: [],
      matchedBy: [],
      sources: [],
    };
    entry.quantity += quantity;
    entry.matchedBy.push(ruled ? 'partCode' : 'assistant');
    if (source) entry.sources.push(source);
    const warranty =
      line.itemType === 'device' ? warrantyEnd(row, start) : undefined;
    if (warranty && !entry.warrantyEndDate) {
      entry.warrantyEndDate = warranty;
      if (source) entry.warrantySource = source;
    }
    if (line.itemType === 'device')
      for (let index = 0; index < quantity; index += 1)
        entry.units.push(
          serials[index]
            ? { serialNo: serials[index], ...(source ? { source } : {}) }
            : { serialNo: '' },
        );
    planned.set(line.id, entry);
  }

  const plannedLines: PlannedLine[] = lines.flatMap((line) => {
    const entry = planned.get(line.id);
    return entry ? [{ lineId: line.id, ...entry }] : [];
  });
  for (const line of lines)
    if (
      line.outstanding > 0 &&
      planned.has(line.id) &&
      (planned.get(line.id)?.quantity ?? 0) < line.outstanding
    )
      issues.push(
        issue('shortDelivery', {
          lineId: line.id,
          expected: line.outstanding,
          actual: planned.get(line.id)?.quantity,
        }),
      );

  return {
    header: {
      deliveryNo: draft.deliveryNo?.trim() || null,
      deliveryDate: draft.deliveryDate?.trim() || null,
      vendorName: draft.vendorName?.trim() || null,
    },
    lines: plannedLines,
    issues: [
      ...issues,
      ...checkBatch(
        plannedLines.map((line) => ({
          lineId: line.lineId,
          quantity: line.quantity,
          serialNos: line.units.map((unit) => unit.serialNo),
        })),
        lines,
        new Set(),
      ),
    ],
  };
}

/**
 * What stops a batch as the form holds it: more than a line has left, a
 * serial twice in the batch or already on the books, a device without the
 * serial its category requires. `registered` holds the serials of the batch
 * that already belong to a device.
 */
export function checkBatch(
  batch: readonly BatchLine[],
  lines: readonly PlanLine[],
  registered: ReadonlySet<string>,
): ReceiptIssue[] {
  const issues: ReceiptIssue[] = [];
  const byId = new Map(lines.map((line) => [line.id, line]));
  const seen = new Map<string, number>();
  for (const entry of batch)
    for (const serial of clean(entry.serialNos))
      seen.set(serial, (seen.get(serial) ?? 0) + 1);
  const reported = new Set<string>();
  for (const entry of batch) {
    const line = byId.get(entry.lineId);
    if (!line) continue;
    if (entry.quantity > line.outstanding)
      issues.push(
        issue('overReceipt', {
          lineId: line.id,
          expected: line.outstanding,
          actual: entry.quantity,
        }),
      );
    if (line.itemType !== 'device') continue;
    const serials = (entry.serialNos ?? []).map((serial) => serial.trim());
    if (
      line.requiresSerial &&
      (serials.length < entry.quantity || serials.some((serial) => !serial))
    )
      issues.push(issue('serialRequired', { lineId: line.id }));
    for (const serial of serials) {
      if (!serial || reported.has(serial)) continue;
      if ((seen.get(serial) ?? 0) > 1) {
        reported.add(serial);
        issues.push(
          issue('duplicateInBatch', { lineId: line.id, serialNo: serial }),
        );
      } else if (registered.has(serial)) {
        reported.add(serial);
        issues.push(
          issue('duplicateInRegister', { lineId: line.id, serialNo: serial }),
        );
      }
    }
  }
  return issues;
}

/** Every serial a batch names, for the register lookup. */
export const batchSerials = (batch: readonly BatchLine[]): string[] => [
  ...new Set(batch.flatMap((entry) => clean(entry.serialNos))),
];

export interface FieldStats {
  readonly accepted: number;
  readonly changed: number;
  readonly removed: number;
  readonly added: number;
}

export interface ReceiptStats {
  readonly quantity: FieldStats;
  readonly serialNo: FieldStats;
}

const ZERO: FieldStats = { accepted: 0, changed: 0, removed: 0, added: 0 };

/**
 * How much of the plan the receiver kept: per line for the quantity, per
 * unit for the serials. A serial replaced by another counts as changed, one
 * dropped as removed and one typed in as added — the counts the trust ladder
 * reads.
 */
export function receiptStats(
  plan: ReceiptPlan,
  saved: readonly BatchLine[],
): ReceiptStats {
  const quantity = { ...ZERO };
  const serialNo = { ...ZERO };
  const finalById = new Map(saved.map((entry) => [entry.lineId, entry]));
  for (const line of plan.lines) {
    const kept = finalById.get(line.lineId);
    if (!kept || kept.quantity < 1) quantity.removed += 1;
    else if (kept.quantity === line.quantity) quantity.accepted += 1;
    else quantity.changed += 1;
    const proposed = new Set(
      line.units.map((unit) => unit.serialNo).filter(Boolean),
    );
    const final = new Set(clean(kept?.serialNos));
    const dropped = [...proposed].filter((serial) => !final.has(serial));
    const typed = [...final].filter((serial) => !proposed.has(serial));
    const changed = Math.min(dropped.length, typed.length);
    serialNo.accepted += proposed.size - dropped.length;
    serialNo.changed += changed;
    serialNo.removed += dropped.length - changed;
    serialNo.added += typed.length - changed;
  }
  const plannedIds = new Set(plan.lines.map((line) => line.lineId));
  for (const entry of saved) {
    if (plannedIds.has(entry.lineId) || entry.quantity < 1) continue;
    quantity.added += 1;
    serialNo.added += clean(entry.serialNos).length;
  }
  return { quantity, serialNo };
}

/** Adds one run's counts to a running total. */
export const addStats = (
  total: ReceiptStats,
  run: ReceiptStats,
): ReceiptStats => ({
  quantity: sum(total.quantity, run.quantity),
  serialNo: sum(total.serialNo, run.serialNo),
});

const sum = (a: FieldStats, b: FieldStats): FieldStats => ({
  accepted: a.accepted + b.accepted,
  changed: a.changed + b.changed,
  removed: a.removed + b.removed,
  added: a.added + b.added,
});

export const EMPTY_STATS: ReceiptStats = { quantity: ZERO, serialNo: ZERO };
