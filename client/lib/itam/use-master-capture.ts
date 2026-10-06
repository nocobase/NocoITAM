import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  useAI,
  useAIPageElementHandle,
  type AIChatMessage,
  type AIFrontendToolRegistration,
} from '@/extensions/nocobase-ai';

import { useHiddenChat, useItamAi } from './ai-chat.js';
import { masterDataPath, useApi, useItamList, type ItamRecord } from './api.js';
import { todayIso } from './format.js';
import {
  MASTER_CAPTURE_TOOLS,
  type MasterCapture,
  type MasterCaptureCollection,
} from './master-capture.js';
import { templateOf } from './field-template.js';
import { readSearchTurn } from './search-turn.js';
import { treePathLabel } from './tree.js';
import type { Turn } from './use-purchase-capture.js';

type Mode = 'organise' | 'adjust';

interface Session {
  readonly mode: Mode;
  readonly phase: 'reading' | 'done' | 'failed';
  readonly prompt?: string;
  /** The chat's messages when the turn was asked, so an earlier turn never
   * answers it. */
  readonly before?: readonly AIChatMessage[];
  /** Whether the page tool delivered a reading in this turn. */
  readonly filled?: boolean;
  /** Whether this turn searched the web. */
  readonly searching?: boolean;
  readonly message?: string;
  readonly conversationId?: string;
}

export interface MasterCaptureState {
  /** A model is configured and the assistant is switched on. */
  readonly available: boolean;
  /** A model that can search the web is configured. */
  readonly searches: boolean;
  readonly busy: boolean;
  readonly mode: Mode | undefined;
  readonly failure: string | undefined;
  readonly turns: readonly Turn[];
  /** What the assistant said after organising, before any adjustment. */
  readonly summary: string | undefined;
  /** Whether the turn that filled the form searched the web. */
  readonly searched: boolean;
  readonly organise: (material: string) => void;
  readonly adjust: (instruction: string) => void;
  /** Lets go of the conversation, as the dialog closes. */
  readonly release: () => void;
}

export interface MasterCaptureHandle extends MasterCaptureState {
  /** Attach to the dialog's body: it registers the page tool. */
  readonly contextRef: (element: HTMLElement | null) => void;
}

/** The fields each tool takes, described for the model. */
const PROPERTIES: Readonly<
  Record<MasterCaptureCollection, Record<string, unknown>>
> = {
  models: {
    name: { type: 'string' },
    code: { type: 'string' },
    manufacturerName: { type: 'string' },
    categoryId: { type: 'string' },
    specification: { type: 'string' },
    warrantyMonths: { type: 'integer', minimum: 1 },
    releaseDate: { type: 'string' },
    eolDate: { type: 'string' },
    eosDate: { type: 'string' },
    attributes: { type: 'object', additionalProperties: true },
  },
  softwareProducts: {
    name: { type: 'string' },
    manufacturerName: { type: 'string' },
    categoryId: { type: 'string' },
    deliveryMethod: { type: 'string', enum: ['onPremise', 'saas', 'both'] },
    description: { type: 'string' },
    website: { type: 'string' },
  },
};

const DESCRIPTIONS: Readonly<Record<MasterCaptureCollection, string>> = {
  models:
    'Hand the model you looked up to the new model form on screen, which the user checks and saves. Call it once, with the whole form. name: the model name without the maker in front. code: the maker part number or model code, only when a source states it. manufacturerName: the maker as it is commonly called; the form matches it to its records. categoryId: one id from the page context categories. specification: the main specifications, one per line. warrantyMonths: the standard warranty in months. releaseDate, eolDate, eosDate: YYYY-MM-DD, only when a source states them. attributes: the fields of the chosen category (page context categories[].fields), by key, each of its type — a select takes one of its options, a boolean true or false, a number a number — and only what a source states. sources: the web pages you used, title and url. uncertain: the field names you filled but are not sure of.',
  softwareProducts:
    'Hand the software product you looked up to the new software product form on screen, which the user checks and saves. Call it once, with the whole form. name: the product name. manufacturerName: the vendor as it is commonly called; the form matches it to its records. categoryId: one id from the page context categories. deliveryMethod: saas, onPremise or both. description: one or two sentences on what the product is for. website: the product home page. sources: the web pages you used, title and url. uncertain: the field names you filled but are not sure of.',
};

/**
 * AI 整理 for a new model or software product (2026-10-06): what the reader
 * knows — a maker and a model, usually — goes to the assistant in a
 * conversation of its own (`ItamAi.master`) with the web search on when a
 * configured model can search, and comes back through one page tool,
 * `fillModel` / `fillSoftwareProduct`. The server checks the reading
 * (`/itam/master/:collection/capture/match`) before the form takes it. An
 * adjustment is a new turn with the material, the form as it stands and
 * what to change. The conversation is deleted once its turn is over; nothing
 * is saved until the reader saves.
 */
export function useMasterCapture({
  collection,
  form,
  onFill,
}: {
  readonly collection: MasterCaptureCollection;
  /** The form as it stands, read when the assistant asks for the context. */
  readonly form: () => Readonly<Record<string, unknown>>;
  readonly onFill: (capture: MasterCapture) => void;
}): MasterCaptureHandle {
  const { t } = useTranslation();
  const api = useApi();
  const ai = useItamAi();
  const { models } = useAI();
  const chat = useHiddenChat('master');
  const [session, setSession] = useState<Session>();
  const [turns, setTurns] = useState<readonly Turn[]>([]);
  const [summary, setSummary] = useState<string>();
  const [searched, setSearched] = useState(false);
  const materialRef = useRef<string | undefined>(undefined);
  const onFillRef = useRef(onFill);
  const formRef = useRef(form);
  useEffect(() => {
    onFillRef.current = onFill;
    formRef.current = form;
  }, [onFill, form]);
  // The chat runs on the employee's default model unless told otherwise;
  // for a search it is told to use one that can.
  const searchModel = models.find((model) => model.supportWebSearch);

  const categories = useItamList<ItamRecord>(
    masterDataPath('categories'),
    { pageSize: 500, sort: 'sort' },
    { enabled: Boolean(ai?.available) },
  );
  const categoryRows = useMemo(
    () => categories.data?.data ?? [],
    [categories.data],
  );
  const categoriesRef = useRef(categoryRows);
  useEffect(() => {
    categoriesRef.current = categoryRows;
  }, [categoryRows]);

  const tool = MASTER_CAPTURE_TOOLS[collection];
  const tools = useMemo(
    (): AIFrontendToolRegistration[] => [
      {
        name: tool,
        title:
          collection === 'models'
            ? 'Fill the new model form'
            : 'Fill the new software product form',
        description: DESCRIPTIONS[collection],
        permission: 'ALLOW',
        inputSchema: {
          type: 'object',
          properties: {
            ...PROPERTIES[collection],
            uncertain: { type: 'array', items: { type: 'string' } },
            sources: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  url: { type: 'string' },
                },
                required: ['url'],
              },
            },
          },
          required: ['name'],
        },
        execute: async (args: unknown) => {
          const { data } = await api.request<{ data: MasterCapture }>({
            path: `${masterDataPath(collection)}/capture/match`,
            method: 'POST',
            json: args ?? {},
          });
          onFillRef.current(data);
          setSession((current) =>
            current?.phase === 'reading'
              ? { ...current, filled: true }
              : current,
          );
          // What the form made of it, so the closing sentence can say what
          // the reader still has to do.
          return {
            fieldsFilled: Object.keys(data.values),
            manufacturerNotFound: data.manufacturerName,
            alreadyOnTheBooks: data.duplicates.map((row) => row.name),
          };
        },
      },
    ],
    [api, collection, tool],
  );
  const { ref: contextRef, context } = useAIPageElementHandle({
    id: `itam-${collection}-capture`,
    title: t(`${collection}.capture.context`),
    kind: `${collection}Draft`,
    getContext: () => ({
      today: todayIso(),
      // Only the categories this record may take, named with their parents.
      categories: categoriesRef.current
        .filter((row) =>
          collection === 'models'
            ? row.appliesTo !== 'entitlement'
            : row.appliesTo === 'entitlement',
        )
        .map((row) => ({
          id: row.id,
          name: treePathLabel(categoriesRef.current, row.id),
          appliesTo: row.appliesTo,
          // The extended fields a model of this category keeps for its
          // devices, which the reading may fill.
          ...(collection === 'models'
            ? {
                fields: templateOf(row.fieldTemplate)
                  .filter((field) => !field.hidden)
                  .map((field) => ({
                    key: field.key,
                    label: field.label,
                    type: field.type,
                    ...(field.options ? { options: field.options } : {}),
                  })),
              }
            : {}),
        })),
      form: formRef.current(),
    }),
    tools,
  });

  const turn =
    session?.phase === 'reading' &&
    session.prompt &&
    chat.messages !== session.before
      ? readSearchTurn(chat, session.prompt)
      : undefined;
  if (session && turn?.asked && !turn.working) {
    const said = plain(turn.text);
    if (session.filled) {
      setSearched(Boolean(session.searching));
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
        : plain(turn.failed || turn.text) || t('masterCapture.nothing'),
      conversationId: turn.conversationId,
    });
  }

  // The conversation was only the means: it leaves nothing in the reader's
  // history.
  const removedRef = useRef(new Set<string>());
  useEffect(() => {
    const id = session?.conversationId;
    if (!id || removedRef.current.has(id)) return;
    removedRef.current.add(id);
    void ai?.master.state
      .get()
      .removeConversation?.(id)
      .catch(() => undefined);
  });

  const ask = (mode: Mode, prompt: string, material: string) => {
    if (!ai?.available) return;
    setSession({
      mode,
      phase: 'reading',
      searching: Boolean(searchModel),
      prompt,
      before: ai.master.state.get().messages,
    });
    ai.master.ask(
      `${prompt}\n\n<material>\n${material.trim()}\n</material>`,
      [context],
      {
        // Nothing of the register to read or write: the page tool is all.
        skillSettings: { skills: [], tools: [] },
        ...(searchModel
          ? {
              webSearch: true,
              model: {
                llmService: searchModel.llmService,
                model: searchModel.value,
              },
            }
          : {}),
      },
    );
  };

  const search = t(
    searchModel ? 'ai.prompts.masterSearch' : 'ai.prompts.masterNoSearch',
  );

  return {
    available: Boolean(ai?.available),
    searches: Boolean(searchModel),
    busy: session?.phase === 'reading',
    mode: session?.mode,
    failure: session?.phase === 'failed' ? session.message : undefined,
    turns,
    summary,
    searched,
    organise: (material) => {
      if (!material.trim()) return;
      materialRef.current = material;
      ask(
        'organise',
        t(
          collection === 'models'
            ? 'ai.prompts.captureModel'
            : 'ai.prompts.captureSoftwareProduct',
          { search },
        ),
        material,
      );
    },
    adjust: (instruction) => {
      const said = instruction.trim();
      if (!said || materialRef.current === undefined) return;
      setTurns((current) => [
        ...current,
        { id: crypto.randomUUID(), from: 'user', text: said },
      ]);
      ask(
        'adjust',
        t('ai.prompts.adjustMasterRecord', {
          object: t(`${collection}.object`),
          tool,
          search,
          instruction: said,
        }),
        materialRef.current,
      );
    },
    release: () => {
      const id = ai?.master.state.get().conversationId;
      if (id && id !== '__draft__')
        void ai?.master.state
          .get()
          .removeConversation?.(id)
          .catch(() => undefined);
    },
    contextRef,
  };
}

/** The assistant is asked for plain text; emphasis would show as asterisks. */
const plain = (value: string): string => value.replace(/\*\*|__|`/g, '').trim();
