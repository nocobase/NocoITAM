import type { DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';
import { isFileId } from './attachments.js';

/**
 * A document as text, read on the server: a delivery note when a receipt
 * run starts, a quote or invoice when 解析单据 fills an order's lines.
 *
 * The text is what the model reads (`ai-reading.ts`), and it is kept on a
 * receipt run, where it is the document of the eval case the run becomes.
 *
 * Plain text is decoded as it is (a CSV loader that takes the first line for
 * the column names drops every column of a delivery note whose own header
 * block comes first). Spreadsheets are read sheet by sheet and row by row
 * (exceljs), Word documents as their raw text (mammoth) and PDF as the text
 * of each page (unpdf) — the readers the AI employee plugin lent this until
 * template 1.0.0-beta.64. A picture, or a legacy .xls / .doc, is not read:
 * the page says so and the person types what it says.
 */
export interface DocumentText {
  readonly text: string;
  /** The text was longer than a run keeps and was cut. */
  readonly truncated: boolean;
}

export type ReadDocument = (
  fileId: string,
) => Promise<DocumentText | undefined>;

/**
 * The reader as a service: receiving by delivery document and 解析单据 both
 * give the assistant a document this way.
 */
export const documentReaderToken: ServiceToken<ReadDocument> =
  createServiceToken<ReadDocument>('itam/document-reader');

/** Reads a stored file's bytes (the file plugin's disk). */
export type ReadBytes = (disk: string, key: string) => Promise<Uint8Array>;

/** What a run keeps of a document: delivery notes are short. */
export const MAX_DOCUMENT_TEXT = 60_000;

const PLAIN = new Set(['csv', 'tsv', 'txt', 'md', 'json']);
const LOADED = new Set(['xlsx', 'xlsm', 'docx', 'pdf']);

/** Text as a run keeps it: without a byte-order mark, and bounded. */
export function documentText(raw: string): DocumentText | undefined {
  const text = raw.replace(/^\uFEFF/, '').trim();
  if (!text) return undefined;
  return text.length > MAX_DOCUMENT_TEXT
    ? { text: text.slice(0, MAX_DOCUMENT_TEXT), truncated: true }
    : { text, truncated: false };
}

export function createDocumentReader(deps: {
  readonly database: DatabaseManager;
  /** Undefined where no disk is configured (the test container). */
  readonly readBytes: () => ReadBytes | undefined;
}): ReadDocument {
  return async (fileId) => {
    if (!isFileId(fileId)) return undefined;
    const file = await deps.database
      .query()
      .selectFrom('itamFiles')
      .select(['disk', 'key', 'ext', 'mimeType'])
      .where('id', '=', fileId)
      .executeTakeFirst<{
        disk: string;
        key: string;
        ext: string | null;
        mimeType: string | null;
      }>();
    const readBytes = deps.readBytes();
    if (!file || !readBytes) return undefined;
    const ext = (file.ext ?? '').replace(/^\./, '').toLowerCase();
    if (!PLAIN.has(ext) && !LOADED.has(ext)) return undefined;
    const bytes = await readBytes(file.disk, file.key);
    if (PLAIN.has(ext))
      return documentText(new TextDecoder('utf-8').decode(bytes));
    return documentText(await loadText(ext, bytes));
  };
}

/** The text of a spreadsheet, a Word document or a PDF. */
async function loadText(ext: string, bytes: Uint8Array): Promise<string> {
  if (ext === 'docx') {
    const mammoth = await import('mammoth');
    const { value } = await mammoth.extractRawText({
      buffer: Buffer.from(bytes),
    });
    return value;
  }
  if (ext === 'pdf') {
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: false });
    return text
      .map((page, index) => `--- page ${String(index + 1)} ---\n${page}`)
      .join('\n\n');
  }
  // A spreadsheet: each sheet under its name, each row its cells by tabs, so
  // "Sheet1 row 4" in the reading names a row a person can find.
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
  const sheets: string[] = [];
  workbook.eachSheet((sheet) => {
    const rows: string[] = [`--- ${sheet.name} ---`];
    sheet.eachRow({ includeEmpty: false }, (row, number) => {
      const cells = (row.values as unknown[])
        .slice(1)
        .map((cell) => cellText(cell));
      if (cells.some(Boolean))
        rows.push(`row ${String(number)}\t${cells.join('\t')}`);
    });
    sheets.push(rows.join('\n'));
  });
  return sheets.join('\n\n');
}

function cellText(cell: unknown): string {
  if (cell === null || cell === undefined) return '';
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  if (typeof cell === 'object') {
    const value = cell as {
      text?: unknown;
      result?: unknown;
      richText?: { text: string }[];
    };
    if (value.richText) return value.richText.map((run) => run.text).join('');
    if (value.result !== undefined) return cellText(value.result);
    if (typeof value.text === 'string') return value.text;
    return '';
  }
  return typeof cell === 'string' ||
    typeof cell === 'number' ||
    typeof cell === 'boolean'
    ? String(cell).replace(/[\t\n]+/g, ' ')
    : '';
}
