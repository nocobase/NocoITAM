import { useToaster } from '@nocobase/app-client';
import {
  buildPageContext,
  useChatAgents,
  useChatContextSource,
  useChatController,
  useChatPanel,
  type ChatContextItem,
} from '@nocobase/app-plugin-agents/client/chat';
import type {
  ConversationSource,
  MessageAttachment,
  PageContext,
} from '@nocobase/app-plugin-agents/shared/conversations';
import type { ModelRef } from '@nocobase/app-plugin-agents/shared/models';
import { useTranslation } from '@nocobase/i18n/client';
import { useCallback, useMemo } from 'react';

import {
  AI_PATH,
  useAiStatus,
  type AiReading,
  type AiReadingTask,
} from './ai.js';
import { useApi } from './api.js';

/**
 * The assistant as the pages see it (template 1.0.0-beta.64): Asset Steward on the
 * Agents plugin, in its chat panel (`client/layouts/agent-chat.tsx`).
 * Whether a model is there to answer, asking a question with the page's
 * record pinned, and opening a conversation. Without a model the page
 * shortcuts hide and the pages keep their plain forms.
 */
export interface ItamAi {
  readonly available: boolean;
  /**
   * Opens the panel on a new conversation about `pins` (records the page
   * shows) and sends the prompt; `autoSend: false` drafts it in the
   * composer instead, for a request the person completes.
   */
  readonly ask: (
    prompt: string,
    options?: {
      readonly autoSend?: boolean;
      readonly pins?: readonly ChatContextItem[];
    },
  ) => void;
  /** Opens the panel on a conversation that already exists. */
  readonly openConversation: (conversationId: string) => void;
}

/** Where ITAM's conversations come from (`itam-agents/index.ts`). */
export const ITAM_SOURCE = 'itam';

/**
 * The agent ITAM's conversations go to: the plugin's native online agent,
 * which Asset Steward is (Agents plugin 1.0, 2026-10-20,
 * `itam-agents/assistant.ts`). A runner agent cannot take ITAM's tools, so
 * ITAM's own ways of asking never go to one.
 */
export const ITAM_AGENT = 'online';

/** The page context a question is sent with: the given records only. */
export function contextOf(
  route: string,
  items: readonly ChatContextItem[],
): PageContext | undefined {
  return buildPageContext({
    route,
    pinned: items,
    sources: [],
    filter: null,
    selection: null,
    removed: new Set(),
  });
}

/**
 * Starts a conversation with Asset Steward and sends its first message,
 * through the plugin's chat controller, which holds the request whatever
 * view is open (plugin 1.0: messages go through its stream, not a request of
 * their own). Resolves with the conversation's id once it is created;
 * rejects when it was not.
 */
export function useStartConversation(): (input: {
  readonly content: string;
  readonly source: ConversationSource;
  readonly context?: PageContext;
  readonly attachments?: readonly MessageAttachment[];
  readonly model?: ModelRef;
}) => Promise<string> {
  const controller = useChatController();
  return useCallback(
    ({ content, source, context, attachments = [], model }) =>
      new Promise<string>((resolve, reject) => {
        const submissions = controller.submissions;
        // The submission's id, known once it is submitted below.
        const sent: { clientId: string | undefined } = { clientId: undefined };
        const done = (outcome: () => void) => {
          off();
          stop();
          outcome();
        };
        const off = submissions.onUpdated((detail, record, created) => {
          if (created && record.clientId === sent.clientId)
            done(() => resolve(detail.id));
        });
        const stop = submissions.subscribe(() => {
          const record = submissions
            .snapshot()
            .find((item) => item.clientId === sent.clientId);
          if (!record) return;
          if (record.conversationId && record.status === 'confirmed')
            done(() => resolve(record.conversationId as string));
          else if (
            ['creationUnknown', 'notSubmitted', 'rejected'].includes(
              record.status,
            )
          )
            done(() =>
              reject(
                record.error instanceof Error
                  ? record.error
                  : new Error(record.status),
              ),
            );
        });
        const submitted = submissions.submit({
          content,
          context,
          attachments,
          conversationId: null,
          editorKey: `itam:${source}:${crypto.randomUUID()}`,
          create: {
            agentId: ITAM_AGENT,
            source,
            ...(model
              ? {
                  selectedModel: {
                    modelService: model.modelService,
                    model: model.model,
                  },
                }
              : {}),
          },
        });
        if (!submitted) {
          done(() => reject(new Error('notSubmitted')));
          return;
        }
        sent.clientId = submissions.snapshot().at(-1)?.clientId;
      }),
    [controller],
  );
}

export function useItamAi(): ItamAi {
  const status = useAiStatus();
  const panel = useChatPanel();
  const agents = useChatAgents(panel.available);
  const start = useStartConversation();
  const toaster = useToaster();
  const { t } = useTranslation();
  const agent = agents.data?.find((item) => item.id === ITAM_AGENT) ?? null;
  const available = Boolean(panel.available && status.data?.available && agent);

  const ask = useCallback<ItamAi['ask']>(
    (prompt, options = {}) => {
      if (!agent) return;
      const pins = options.pins ?? [];
      if (options.autoSend === false) {
        panel.clearPinned();
        panel.openChat({
          conversationId: null,
          agentId: ITAM_AGENT,
          view: 'chat',
          draft: prompt,
        });
        for (const pin of pins) panel.openChat({ pin });
        panel.focusComposer();
        return;
      }
      const context = contextOf(window.location.pathname, pins);
      panel.clearPinned();
      start({
        content: prompt,
        source: ITAM_SOURCE,
        ...(context ? { context } : {}),
      }).then(
        (conversationId) => panel.openChat({ conversationId, view: 'chat' }),
        () => {
          toaster.show({ type: 'error', title: t('ai.sendFailed') });
          panel.openChat({
            conversationId: null,
            agentId: ITAM_AGENT,
            view: 'chat',
            draft: prompt,
          });
          for (const pin of pins) panel.openChat({ pin });
        },
      );
    },
    [agent, panel, start, t, toaster],
  );

  return useMemo(
    () => ({
      available,
      ask,
      openConversation: (conversationId: string) =>
        panel.openChat({ conversationId, view: 'chat' }),
    }),
    [available, ask, panel],
  );
}

/**
 * A record the page shows, as context for the chat: its chip sits above the
 * composer while the page is open, and `ask` opens a new conversation with
 * it pinned. The server resolves the id under the reader's own grants
 * (`itam-agents/context.ts`), and the assistant reads it with its commands.
 */
export function useAiPageContext(
  item: {
    readonly kind: string;
    readonly id: string;
    readonly label: string;
  } | null,
): {
  readonly available: boolean;
  readonly ask: (
    prompt: string,
    options?: { readonly autoSend?: boolean },
  ) => void;
} {
  const ai = useItamAi();
  const kind = item?.kind;
  const id = item?.id;
  const label = item?.label;
  const pin = useMemo<ChatContextItem | null>(
    () => (kind && id ? { kind, id, label: label ?? id } : null),
    [kind, id, label],
  );
  useChatContextSource(pin);
  return {
    available: ai.available,
    ask: (prompt, options) =>
      ai.ask(prompt, { ...options, pins: pin ? [pin] : [] }),
  };
}

/**
 * A form filled from material (AI 整理, a delivery document): one call to
 * the model on the server, answered in the shape the form's handler takes.
 */
export function useAiReading(): (input: {
  readonly task: AiReadingTask;
  readonly material: string;
  readonly context: Readonly<Record<string, unknown>>;
  readonly instruction?: string;
}) => Promise<AiReading> {
  const api = useApi();
  const { i18n } = useTranslation();
  return useCallback(
    async (input) =>
      (
        await api.request<{ data: AiReading }>({
          path: `${AI_PATH}/read`,
          method: 'POST',
          json: { ...input, language: i18n.language || 'en-US' },
        })
      ).data,
    [api, i18n.language],
  );
}
