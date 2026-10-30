/**
 * Receiving several order lines at once, and receiving by delivery document:
 * the shapes the server answers with (`server/providers/itam/receipt-plan.ts`
 * and `receipt-runs.ts`) and the few rules the form needs to agree with it.
 */

export type ReceiptIssueCode =
  | 'unmatched'
  | 'matchConflict'
  | 'codeNameConflict'
  | 'orderMismatch'
  | 'shortDelivery'
  | 'serialCount'
  | 'overReceipt'
  | 'duplicateInBatch'
  | 'duplicateInRegister'
  | 'serialRequired';

export interface ReceiptIssue {
  readonly code: ReceiptIssueCode;
  readonly blocking: boolean;
  readonly lineId?: string;
  readonly serialNo?: string;
  readonly description?: string;
  readonly source?: string;
  readonly expected?: number;
  readonly actual?: number;
  /** `orderMismatch`: the order number the document prints. */
  readonly orderNo?: string;
}

export interface PlannedUnit {
  readonly serialNo: string;
  readonly source?: string;
}

export interface PlannedLine {
  readonly lineId: string;
  readonly quantity: number;
  readonly units: readonly PlannedUnit[];
  readonly matchedBy: readonly ('partCode' | 'assistant')[];
  readonly sources: readonly string[];
  /** Devices: the warranty end the document states, as a date. */
  readonly warrantyEndDate?: string;
  readonly warrantySource?: string;
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

export type ReceiptRunStatus =
  'reading' | 'drafted' | 'saved' | 'discarded' | 'failed';

export interface ReceiptRunRow {
  readonly id: string;
  readonly purchaseOrderId: string;
  readonly orderNo: string | null;
  readonly documentName: string;
  readonly actorId: string;
  readonly ownerId: string | null;
  readonly status: ReceiptRunStatus;
  readonly stats: ReceiptStats | null;
  readonly failure: string | null;
  readonly createdAt: string;
  readonly finishedAt: string | null;
}

export interface ReceiptRunReport {
  readonly summary: {
    readonly runs: Readonly<Record<ReceiptRunStatus, number>>;
    readonly fields: ReceiptStats;
  };
  readonly recent: readonly ReceiptRunRow[];
}

/**
 * The documents the server reads as text (`document-text.ts`): spreadsheets
 * row by row, Word and PDF as their text, CSV and plain text as they are. A
 * picture is not read: the model is given text only.
 */
export const DOCUMENT_ACCEPT = [
  '.xlsx',
  '.xlsm',
  '.csv',
  '.docx',
  '.pdf',
  '.txt',
].join(',');

/**
 * Several serials pasted at once — a column copied from a spreadsheet, a
 * scanner's run — one per line, or separated by commas or tabs.
 */
export const splitSerials = (value: string): string[] =>
  value
    .split(/[\r\n\t,;，；]+/)
    .map((serial) => serial.trim())
    .filter(Boolean);

/** Share of a field's proposals the receivers kept as they were, 0–1. */
export const keptShare = (stats: FieldStats): number | undefined => {
  const proposed = stats.accepted + stats.changed + stats.removed;
  return proposed === 0 ? undefined : stats.accepted / proposed;
};
