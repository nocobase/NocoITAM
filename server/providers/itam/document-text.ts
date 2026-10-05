import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { loadByWorker } from '@nocobase/ai-employee';
import type { DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

/**
 * A document as text, read on the server: a delivery note when a receipt
 * run starts, a quote or invoice when 解析单据 fills an order's lines.
 *
 * The AI plugin parses a file attached to a message into that one request
 * only: once the conversation resumes — which it does as soon as the page
 * tool `prefillReceipt` is approved — the document is gone and the model is
 * left saying it cannot open it (found 2026-10-05). So the text goes into
 * the message itself, where every later turn still has it, and onto the run,
 * where it is the document of the eval case the run becomes.
 *
 * Plain text is decoded as it is: the plugin's CSV loader takes the first
 * line as the header, and a delivery note's first lines are its own header
 * block, so every column past the second was dropped. Spreadsheets, Word and
 * PDF go through the plugin's own loader (`loadByWorker`), which is what a
 * file attached in the chat is read with. A picture is not text: it is sent
 * to the model as an attachment, and only a model that reads images reads it.
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
const LOADED = new Set(['xlsx', 'xls', 'xlsm', 'docx', 'doc', 'pdf', 'pptx']);

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
    // The loader reads a path, so the bytes go to a temporary file named
    // with the extension the loader is chosen by.
    const directory = await mkdtemp(path.join(os.tmpdir(), 'itam-document-'));
    try {
      const filePath = path.join(directory, `document.${ext}`);
      await writeFile(filePath, bytes);
      const documents = await loadByWorker(`.${ext}`, {
        filePath,
        mimeType: file.mimeType ?? '',
      });
      return documentText(
        documents.map((document) => document.pageContent).join('\n\n'),
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  };
}
