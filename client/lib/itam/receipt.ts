import type { AIChatAttachment } from '@/extensions/nocobase-ai';

/**
 * Receiving several order lines at once, and receiving by delivery document:
 * the shapes the server answers with (`server/providers/itam/receipt-plan.ts`
 * and `receipt-runs.ts`) and the few rules the form needs to agree with it.
 */

/** What the batch form receives: one record per device, or a quantity. */
export const BATCH_ITEM_TYPES: ReadonlySet<string> = new Set([
  'device',
  'accessory',
  'consumable',
  'component',
]);

export type ReceiptIssueCode =
  | 'unmatched'
  | 'notReceivable'
  | 'matchConflict'
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
 * The files the AI plugin reads as text whatever the model (its document
 * loader): any deployment reads these. Pictures go to the model itself, so
 * only a model that sees images reads a photographed or scanned note.
 */
export const DOCUMENT_ACCEPT = [
  '.xlsx',
  '.xls',
  '.xlsm',
  '.csv',
  '.docx',
  '.doc',
  '.pdf',
  '.txt',
  'image/*',
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

/**
 * A file the AI plugin has stored, in the shape its composer keeps for an
 * attachment (`use-chat-attachments.ts`), so a task can send it the way a
 * file attached by hand is sent.
 */
export function chatAttachmentOf(
  response: Readonly<Record<string, unknown>>,
  file: File,
): AIChatAttachment {
  const meta =
    response.meta && typeof response.meta === 'object'
      ? (response.meta as Record<string, unknown>)
      : undefined;
  const text = (value: unknown, fallback: string): string =>
    typeof value === 'string' && value ? value : fallback;
  const url = typeof response.url === 'string' ? response.url : undefined;
  return {
    ...response,
    uid: text(response.id, crypto.randomUUID()),
    filename: text(response.filename ?? response.title, file.name),
    status: 'done',
    size: typeof response.size === 'number' ? response.size : file.size,
    mimetype: text(response.mimetype, file.type),
    url,
    preview:
      typeof response.preview === 'string'
        ? response.preview
        : file.type.startsWith('image/')
          ? url
          : undefined,
    progress: 100,
    source:
      meta?.source && typeof meta.source === 'object'
        ? meta.source
        : response.source,
  };
}
