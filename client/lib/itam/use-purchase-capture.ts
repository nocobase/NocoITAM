import { useService } from '@nocobase/app-client';
import { clientFileRepositoryManagerToken } from '@nocobase/app-plugin-file/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import { useAiReading, useItamAi } from './ai-chat.js';
import { useApi } from './api.js';
import { errorMessage, text, todayIso } from './format.js';
import { PO_REASONS, PURCHASE_ORDERS_PATH } from './procurement.js';
import { captureArgs, type PurchaseCapture } from './purchase-capture.js';

/** What the dialog has on screen, for the assistant to read and adjust. */
export interface CaptureForm {
  readonly header: Readonly<Record<string, unknown>>;
  readonly lines: readonly Readonly<Record<string, unknown>>[];
  /** Reading into a draft: the lines it already had, not to be repeated. */
  readonly existingLines?: readonly Readonly<Record<string, unknown>>[];
}

type Mode = 'organise' | 'adjust';

interface Session {
  readonly mode: Mode;
  readonly phase: 'uploading' | 'reading' | 'done' | 'failed';
  readonly message?: string;
}

interface Material {
  readonly pasted: string;
  readonly file?: File;
  readonly fileId?: string;
  readonly documentText?: string | null;
}

export interface Turn {
  readonly id: string;
  readonly from: 'user' | 'ai';
  readonly text: string;
}

export interface PurchaseOrderCaptureState {
  /** A model is there to ask. */
  readonly available: boolean;
  readonly busy: boolean;
  readonly mode: Mode | undefined;
  readonly phase: Session['phase'] | undefined;
  readonly failure: string | undefined;
  /** The adjustments asked so far, and what the assistant said to each. */
  readonly turns: readonly Turn[];
  /** The summary of the last organise, before any adjustment. */
  readonly summary: string | undefined;
  /** The uploaded document, to attach to the order once it is saved. */
  readonly fileId: string | undefined;
  readonly organise: (pasted: string, file?: File) => void;
  readonly adjust: (instruction: string) => void;
  /** Stops a reading still running, as the dialog closes. */
  readonly release: () => void;
  /**
   * A line AI 整理 could not place, now placed by the reader — an existing
   * record picked, or one just created — checked by the same match so its
   * kind follows the record's category. Undefined when it still matches
   * nothing.
   */
  readonly place: (
    line: PurchaseCapture['unmatched'][number],
    pick: { readonly modelId: string } | { readonly softwareProductId: string },
  ) => Promise<PurchaseCapture['lines'][number] | undefined>;
}

export type PurchaseOrderCapture = PurchaseOrderCaptureState;

/**
 * AI 整理: the requester's material — pasted text, an uploaded quote or
 * sheet — goes to the model on the server (`POST /itam/ai/read`, template
 * 1.0.0-beta.64), which answers with the order in the shape the dialog
 * takes; the server checks that reading against the master data
 * (`/capture/match`) before the dialog takes it. An adjustment is the same:
 * the material, the form as it stands and what to change. Nothing is saved
 * until the requester saves the order.
 *
 * With `orderId` it is 解析单据 on a draft's lines (2026-10-06): the same
 * reading, matching and placing, but only lines, added to the ones the order
 * has, and the document is kept on that order as soon as it is picked.
 */
export function usePurchaseOrderCapture({
  form,
  onFill,
  orderId,
}: {
  /** The form as it stands, sent with each reading. */
  readonly form: () => CaptureForm;
  readonly onFill: (capture: PurchaseCapture) => void;
  /** The draft whose lines a document is read into. */
  readonly orderId?: string;
}): PurchaseOrderCapture {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const ai = useItamAi();
  const read = useAiReading();
  const files = useService(clientFileRepositoryManagerToken);
  const [session, setSession] = useState<Session>();
  const [turns, setTurns] = useState<readonly Turn[]>([]);
  const [summary, setSummary] = useState<string>();
  const materialRef = useRef<Material | undefined>(undefined);
  const [fileId, setFileId] = useState<string>();
  // A reading answered after the dialog closed, or after a newer one was
  // asked, is dropped.
  const askedRef = useRef(0);

  const ask = (mode: Mode, from: Material, instruction?: string) => {
    if (!ai.available) return;
    const parts: string[] = [];
    if (from.pasted.trim()) parts.push(from.pasted.trim());
    if (from.documentText)
      parts.push(
        `<document filename="${(from.file?.name ?? '').replace(/"/g, "'")}">\n${from.documentText}\n</document>`,
      );
    if (!parts.length) {
      setSession({
        mode,
        phase: 'failed',
        message: t('procurement.capture.unreadable'),
      });
      return;
    }
    const asked = ++askedRef.current;
    setSession({ mode, phase: 'reading' });
    void (async () => {
      try {
        const answer = await read({
          task: orderId ? 'purchaseLines' : 'purchaseOrder',
          material: parts.join('\n\n'),
          context: {
            today: todayIso(),
            reasons: PO_REASONS.map((value) => ({
              value,
              label: t(`enums.poReason.${value}`),
            })),
            form: form(),
          },
          ...(instruction ? { instruction } : {}),
        });
        if (asked !== askedRef.current) return;
        if (!answer.reading) {
          setSession({
            mode,
            phase: 'failed',
            message: answer.said || t('procurement.capture.nothing'),
          });
          return;
        }
        const { data } = await api.request<{ data: PurchaseCapture }>({
          path: `${PURCHASE_ORDERS_PATH}/capture/match`,
          method: 'POST',
          json: captureArgs(answer.reading),
        });
        if (asked !== askedRef.current) return;
        onFill(data);
        if (mode === 'organise') {
          setSummary(answer.said || undefined);
          setTurns([]);
        } else if (answer.said)
          setTurns((current) => [
            ...current,
            { id: crypto.randomUUID(), from: 'ai', text: answer.said },
          ]);
        setSession({ mode, phase: 'done' });
      } catch (error) {
        if (asked === askedRef.current)
          setSession({ mode, phase: 'failed', message: errorMessage(error) });
      }
    })();
  };

  const organise = (pasted: string, file?: File) => {
    if (!ai.available) return;
    const known = materialRef.current;
    // The same file is not uploaded and read again for a second organise.
    if (!file || known?.file === file) {
      const next: Material = file ? { ...known!, pasted } : { pasted };
      materialRef.current = next;
      if (!file) setFileId(undefined);
      ask('organise', next);
      return;
    }
    setSession({ mode: 'organise', phase: 'uploading' });
    void (async () => {
      try {
        const { record } = await files
          .repository('itamAttachments')
          .uploadOne({ file });
        const id = text(record.id);
        // A draft keeps the document at once, and its text is read as one
        // of its own attachments; a new order takes it once it is saved.
        if (orderId) {
          await api.request({
            path: `itam/attachments/purchaseOrders/${orderId}`,
            method: 'POST',
            json: { fileIds: [id] },
          });
          await queryClient.invalidateQueries({
            queryKey: ['itam', 'attachments'],
          });
        }
        const { data } = await api.request<{
          data: { text: string | null };
        }>({
          path: orderId
            ? `${PURCHASE_ORDERS_PATH}/${orderId}/document-text`
            : `${PURCHASE_ORDERS_PATH}/capture/document-text`,
          method: 'POST',
          json: { fileId: id },
        });
        const next: Material = {
          pasted,
          file,
          fileId: id,
          documentText: data.text,
        };
        materialRef.current = next;
        setFileId(id);
        ask('organise', next);
      } catch (error) {
        setSession({
          mode: 'organise',
          phase: 'failed',
          message: errorMessage(error),
        });
      }
    })();
  };

  const adjust = (instruction: string) => {
    const said = instruction.trim();
    if (!said || !materialRef.current) return;
    setTurns((current) => [
      ...current,
      { id: crypto.randomUUID(), from: 'user', text: said },
    ]);
    ask('adjust', materialRef.current, said);
  };

  return {
    place: async (line, pick) => {
      const { data } = await api.request<{ data: PurchaseCapture }>({
        path: `${PURCHASE_ORDERS_PATH}/capture/match`,
        method: 'POST',
        json: {
          lines: [
            {
              ...pick,
              description: line.description,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              itemType: line.itemType,
            },
          ],
        },
      });
      return data.lines[0];
    },
    available: ai.available,
    busy: session?.phase === 'uploading' || session?.phase === 'reading',
    mode: session?.mode,
    phase: session?.phase,
    failure: session?.phase === 'failed' ? session.message : undefined,
    turns,
    summary,
    fileId,
    organise,
    adjust,
    release: () => {
      askedRef.current += 1;
    },
  };
}
