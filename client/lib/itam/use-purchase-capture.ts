import { useService } from '@nocobase/app-client';
import { clientFileRepositoryManagerToken } from '@nocobase/app-plugin-file/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  useAI,
  useAIPageElementHandle,
  type AIChatAttachment,
  type AIChatMessage,
  type AIFrontendToolRegistration,
} from '@/extensions/nocobase-ai';

import { useHiddenChat, useItamAi } from './ai-chat.js';
import { useApi } from './api.js';
import { errorMessage, text, todayIso } from './format.js';
import { PO_REASONS, PURCHASE_ORDERS_PATH } from './procurement.js';
import { captureArgs, type PurchaseCapture } from './purchase-capture.js';
import { chatAttachmentOf } from './receipt.js';
import { readSearchTurn } from './search-turn.js';

/** What the dialog has on screen, for the assistant to read and adjust. */
export interface CaptureForm {
  readonly header: Readonly<Record<string, unknown>>;
  readonly lines: readonly Readonly<Record<string, unknown>>[];
}

type Mode = 'organise' | 'adjust';

interface Session {
  readonly mode: Mode;
  readonly phase: 'uploading' | 'reading' | 'done' | 'failed';
  readonly prompt?: string;
  /** The chat's messages when this turn was asked: a turn is read only once
   * the chat has moved on from them, so an earlier one never answers it. */
  readonly before?: readonly AIChatMessage[];
  /** Whether the page tool delivered an order in this turn. */
  readonly filled?: boolean;
  readonly message?: string;
  /** The conversation the turn ran in, deleted once it is over. */
  readonly conversationId?: string;
}

interface Material {
  readonly pasted: string;
  readonly file?: File;
  readonly fileId?: string;
  readonly documentText?: string | null;
  readonly attachments: readonly AIChatAttachment[];
}

export interface Turn {
  readonly id: string;
  readonly from: 'user' | 'ai';
  readonly text: string;
}

export interface PurchaseOrderCaptureState {
  /** A model is configured and the assistant is switched on. */
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
  /** Lets go of the conversation, as the dialog closes. */
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

export interface PurchaseOrderCapture extends PurchaseOrderCaptureState {
  /** Attach to the dialog's body: it registers the page tool. */
  readonly contextRef: (element: HTMLElement | null) => void;
}

/**
 * AI 整理: the requester's material — pasted text, an uploaded quote or
 * sheet — goes to the assistant in a conversation of its own
 * (`ItamAi.capture`, so the panel's conversation is left alone), with one
 * read-only tool to find models and products and one page tool,
 * `fillPurchaseOrder`, that hands its reading to the dialog. The server
 * checks that reading against the master data (`/capture/match`) before the
 * dialog takes it. An adjustment is the same: a new turn with the material,
 * the form as it stands and what to change. The conversation is deleted once
 * its turn is over; nothing is saved until the requester saves the order.
 */
export function usePurchaseOrderCapture({
  form,
  onFill,
}: {
  /** The form as it stands, read when the assistant asks for the context. */
  readonly form: () => CaptureForm;
  readonly onFill: (capture: PurchaseCapture) => void;
}): PurchaseOrderCapture {
  const { t } = useTranslation();
  const api = useApi();
  const ai = useItamAi();
  const aiService = useAI();
  const files = useService(clientFileRepositoryManagerToken);
  const chat = useHiddenChat('capture');
  const [session, setSession] = useState<Session>();
  const [turns, setTurns] = useState<readonly Turn[]>([]);
  const [summary, setSummary] = useState<string>();
  const materialRef = useRef<Material | undefined>(undefined);
  const [fileId, setFileId] = useState<string>();
  // The page tool is registered once, and reaches the latest callbacks.
  const onFillRef = useRef(onFill);
  const formRef = useRef(form);
  useEffect(() => {
    onFillRef.current = onFill;
    formRef.current = form;
  }, [onFill, form]);

  const tools = useMemo(
    (): AIFrontendToolRegistration[] => [
      {
        name: 'fillPurchaseOrder',
        title: 'Fill the new purchase order form',
        description:
          "Hand the purchase order you organised to the new purchase order form on screen, which the user checks and saves. Call it once, with the whole order. reason: one of the page context reasons (value). description: what is being bought, for whom and why, close to the material's own words. neededBy: YYYY-MM-DD, only when the material gives a date. vendorName and departmentName as the material writes them (they are matched to the records by the form); vendorId only when the page context form already names that vendor. lines: one per item, with description (the item as written), partCode when one is printed, quantity, unitPrice per unit when stated (not the line total), itemType for software (perpetual or subscription), and modelId or softwareProductId only when itam_match_model found that very model or product — another generation, size or edition is not it. uncertain: the header fields (reason, description, neededBy, vendor, department) you filled but are not sure of; a line's uncertain when you are not sure of its item.",
        permission: 'ALLOW',
        inputSchema: {
          type: 'object',
          properties: {
            reason: { type: 'string' },
            description: { type: 'string' },
            neededBy: { type: 'string' },
            vendorId: { type: 'string' },
            vendorName: { type: 'string' },
            departmentName: { type: 'string' },
            uncertain: { type: 'array', items: { type: 'string' } },
            lines: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  description: { type: 'string' },
                  partCode: { type: 'string' },
                  itemType: { type: 'string' },
                  modelId: { type: 'string' },
                  softwareProductId: { type: 'string' },
                  quantity: { type: 'number', minimum: 1 },
                  unitPrice: { type: 'number', minimum: 0 },
                  uncertain: { type: 'boolean' },
                  source: { type: 'string' },
                },
                required: ['description', 'quantity'],
              },
            },
          },
          required: ['lines'],
        },
        execute: async (args: unknown) => {
          const { data } = await api.request<{ data: PurchaseCapture }>({
            path: `${PURCHASE_ORDERS_PATH}/capture/match`,
            method: 'POST',
            json: captureArgs(args),
          });
          onFillRef.current(data);
          setSession((current) =>
            current?.phase === 'reading'
              ? { ...current, filled: true }
              : current,
          );
          // What the form made of it, so the closing sentence can say what
          // the requester still has to do.
          return {
            linesFilled: data.lines.length,
            unmatchedLines: data.unmatched.map((line) => line.description),
            vendorNotFound: data.vendorName,
            departmentNotFound: data.departmentName,
          };
        },
      },
    ],
    [api],
  );
  const { ref: contextRef, context } = useAIPageElementHandle({
    id: 'itam-purchase-order-capture',
    title: t('procurement.capture.context'),
    kind: 'purchaseOrderDraft',
    getContext: () => ({
      today: todayIso(),
      reasons: PO_REASONS.map((value) => ({
        value,
        label: t(`enums.poReason.${value}`),
      })),
      form: formRef.current(),
    }),
    tools,
  });

  // The turn is read out of the chat once the chat has moved on from the
  // messages it held when the turn was asked.
  const turn =
    session?.phase === 'reading' &&
    session.prompt &&
    chat.messages !== session.before
      ? readSearchTurn(chat, session.prompt)
      : undefined;
  if (session && turn?.asked && !turn.working) {
    const said = plain(turn.text);
    if (session.filled) {
      if (session.mode === 'organise') {
        setSummary(said || undefined);
        setTurns([]);
      } else if (said)
        setTurns((current) => [
          ...current,
          { id: crypto.randomUUID(), from: 'ai', text: said },
        ]);
    }
    setSession({
      mode: session.mode,
      phase: session.filled ? 'done' : 'failed',
      message: session.filled
        ? undefined
        : plain(turn.failed || turn.text) || t('procurement.capture.nothing'),
      conversationId: turn.conversationId,
    });
  }

  // The conversation was only the means: it leaves nothing in the
  // requester's history.
  const removedRef = useRef(new Set<string>());
  useEffect(() => {
    const id = session?.conversationId;
    if (!id || removedRef.current.has(id)) return;
    removedRef.current.add(id);
    void ai?.capture.state
      .get()
      .removeConversation?.(id)
      .catch(() => undefined);
  });

  const ask = (mode: Mode, prompt: string, from: Material) => {
    if (!ai?.available) return;
    const parts = [prompt];
    if (from.pasted.trim())
      parts.push(`<pasted_text>\n${from.pasted.trim()}\n</pasted_text>`);
    if (from.documentText)
      parts.push(
        `<document filename="${(from.file?.name ?? '').replace(/"/g, "'")}">\n${from.documentText}\n</document>`,
      );
    setSession({
      mode,
      phase: 'reading',
      prompt,
      before: ai.capture.state.get().messages,
    });
    ai.capture.ask(parts.join('\n\n'), [context], {
      attachments: [...from.attachments],
      // Read-only: finding models and products, and the page tool. The
      // plugin holds the conversation to this list on the server.
      skillSettings: { skills: [], tools: ['itam_match_model'] },
    });
  };

  const organise = (pasted: string, file?: File) => {
    if (!ai?.available) return;
    const known = materialRef.current;
    // The same file is not uploaded and read again for a second organise.
    if (!file || known?.file === file) {
      const next: Material = file
        ? { ...known!, pasted }
        : { pasted, attachments: [] };
      materialRef.current = next;
      if (!file) setFileId(undefined);
      ask('organise', t('ai.prompts.capturePurchaseOrder'), next);
      return;
    }
    setSession({ mode: 'organise', phase: 'uploading' });
    void (async () => {
      try {
        const { record } = await files
          .repository('itamAttachments')
          .uploadOne({ file });
        const id = text(record.id);
        const { data } = await api.request<{
          data: { text: string | null };
        }>({
          path: `${PURCHASE_ORDERS_PATH}/capture/document-text`,
          method: 'POST',
          json: { fileId: id },
        });
        // The text goes in the message itself; only a document the server
        // could not read — a picture — is attached, for a model that reads
        // images.
        const attachments = data.text
          ? []
          : [chatAttachmentOf(await aiService.uploadFile(file), file)];
        const next: Material = {
          pasted,
          file,
          fileId: id,
          documentText: data.text,
          attachments,
        };
        materialRef.current = next;
        setFileId(id);
        ask('organise', t('ai.prompts.capturePurchaseOrder'), next);
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
    ask(
      'adjust',
      t('ai.prompts.adjustPurchaseOrder', { instruction: said }),
      materialRef.current,
    );
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
    available: Boolean(ai?.available),
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
      const id = ai?.capture.state.get().conversationId;
      if (id && id !== '__draft__')
        void ai?.capture.state
          .get()
          .removeConversation?.(id)
          .catch(() => undefined);
    },
    contextRef,
  };
}

/** The assistant is asked for plain text; emphasis would show as asterisks. */
const plain = (value: string): string => value.replace(/\*\*|__|`/g, '').trim();
