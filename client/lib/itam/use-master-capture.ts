import { useTranslation } from '@nocobase/i18n/client';
import { createUuid } from '@nocobase/app-client';
import { useMemo, useRef, useState } from 'react';

import { useAiStatus } from './ai.js';
import { useAiReading, useItamAi } from './ai-chat.js';
import { masterDataPath, useApi, useItamList, type ItamRecord } from './api.js';
import { errorMessage, todayIso } from './format.js';
import type {
  MasterCapture,
  MasterCaptureCollection,
} from './master-capture.js';
import { templateOf } from './field-template.js';
import { treePathLabel } from './tree.js';
import type { Turn } from './use-purchase-capture.js';

type Mode = 'organise' | 'adjust';

interface Session {
  readonly mode: Mode;
  readonly phase: 'reading' | 'done' | 'failed';
  readonly message?: string;
  /** The model answered but filled nothing: what it said, not an error. */
  readonly answered?: boolean;
}

export interface MasterCaptureState {
  /** A model is there to ask. */
  readonly available: boolean;
  /** The categories a reading names are loaded, so one may start. */
  readonly ready: boolean;
  /** Whether the reading searches the web: with a DeepSeek model service. */
  readonly searches: boolean;
  readonly busy: boolean;
  readonly mode: Mode | undefined;
  readonly failure: string | undefined;
  /** `failure` is the model asking for more, not something going wrong. */
  readonly failureAnswered: boolean;
  readonly turns: readonly Turn[];
  /** What the assistant said after organising, before any adjustment. */
  readonly summary: string | undefined;
  /** Whether the turn that filled the form searched the web. */
  readonly searched: boolean;
  readonly organise: (material: string) => void;
  readonly adjust: (instruction: string) => void;
  /** Drops a reading still running, as the dialog closes. */
  readonly release: () => void;
}

export type MasterCaptureHandle = MasterCaptureState;

/**
 * AI 整理 for a new model or software product (2026-10-06): what the reader
 * knows — a maker and a model, usually — goes to the model on the server
 * (`POST /itam/ai/read`, template 1.0.0-beta.64) under the product-lookup skill.
 * With a DeepSeek model service the server searches the web first and the
 * reading cites the pages it used (2026-10-20); otherwise it fills from what
 * the model reliably knows and marks the rest uncertain. The server checks the reading
 * (`/itam/master/:collection/capture/match`) before the form takes it. An
 * adjustment is the material, the form as it stands and what to change;
 * nothing is saved until the reader saves.
 */
export function useMasterCapture({
  collection,
  form,
  onFill,
  refine = false,
}: {
  readonly collection: MasterCaptureCollection;
  /**
   * 完善 (2026-10-21): the form is a record on the books, which the reading
   * checks and completes rather than filling a blank form.
   */
  readonly refine?: boolean;
  /** The form as it stands, sent with each reading. */
  readonly form: () => Readonly<Record<string, unknown>>;
  readonly onFill: (capture: MasterCapture) => void;
}): MasterCaptureHandle {
  const { t } = useTranslation();
  const api = useApi();
  const ai = useItamAi();
  const status = useAiStatus();
  const read = useAiReading();
  const [searched, setSearched] = useState(false);
  const [session, setSession] = useState<Session>();
  const [turns, setTurns] = useState<readonly Turn[]>([]);
  const [summary, setSummary] = useState<string>();
  const materialRef = useRef<string | undefined>(undefined);
  const askedRef = useRef(0);

  const categories = useItamList<ItamRecord>(
    masterDataPath('categories'),
    { pageSize: 500, sort: 'sort' },
    { enabled: ai.available },
  );
  const categoryRows = useMemo(
    () => categories.data?.data ?? [],
    [categories.data],
  );

  const ask = (mode: Mode, material: string, instruction?: string) => {
    if (!ai.available) return;
    const asked = ++askedRef.current;
    setSession({ mode, phase: 'reading' });
    void (async () => {
      try {
        const answer = await read({
          task: collection === 'models' ? 'model' : 'softwareProduct',
          material,
          context: {
            today: todayIso(),
            // Only the categories this record may take, named with their
            // parents, and for a model the extended fields each keeps.
            categories: categoryRows
              .filter((row) =>
                collection === 'models'
                  ? row.appliesTo !== 'entitlement'
                  : row.appliesTo === 'entitlement',
              )
              .map((row) => ({
                id: row.id,
                name: treePathLabel(categoryRows, row.id),
                appliesTo: row.appliesTo,
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
            form: form(),
            ...(refine ? { refine: true } : {}),
          },
          ...(instruction ? { instruction } : {}),
        });
        if (asked !== askedRef.current) return;
        if (!answer.reading) {
          setSession({
            mode,
            phase: 'failed',
            message: answer.said || t('masterCapture.nothing'),
            answered: true,
          });
          return;
        }
        const { data } = await api.request<{ data: MasterCapture }>({
          path: `${masterDataPath(collection)}/capture/match`,
          method: 'POST',
          json: answer.reading,
        });
        if (asked !== askedRef.current) return;
        onFill(data);
        setSearched(answer.searched === true);
        if (mode === 'organise') {
          setSummary(answer.said || undefined);
          setTurns([]);
        } else if (answer.said)
          setTurns((current) => [
            ...current,
            { id: createUuid(), from: 'ai', text: answer.said },
          ]);
        setSession({ mode, phase: 'done' });
      } catch (error) {
        if (asked === askedRef.current)
          setSession({ mode, phase: 'failed', message: errorMessage(error) });
      }
    })();
  };

  return {
    available: ai.available,
    ready: ai.available && categories.isSuccess,
    searches: status.data?.webSearch === true,
    busy: session?.phase === 'reading',
    mode: session?.mode,
    failure: session?.phase === 'failed' ? session.message : undefined,
    failureAnswered: session?.phase === 'failed' && session.answered === true,
    turns,
    summary,
    searched,
    organise: (material) => {
      if (!material.trim()) return;
      materialRef.current = material;
      ask('organise', material);
    },
    adjust: (instruction) => {
      const said = instruction.trim();
      if (!said || materialRef.current === undefined) return;
      setTurns((current) => [
        ...current,
        { id: createUuid(), from: 'user', text: said },
      ]);
      ask('adjust', materialRef.current, said);
    },
    release: () => {
      askedRef.current += 1;
    },
  };
}
