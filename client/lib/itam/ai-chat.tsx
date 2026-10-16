import { useToaster } from '@nocobase/app-client';
import {
  buildPageContext,
  newConversationAgent,
  useChatAgents,
  useChatApi,
  useChatContextSource,
  useChatPanel,
  type ChatContextItem,
} from '@nocobase/app-plugin-agents/client/chat';
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

export function useItamAi(): ItamAi {
  const status = useAiStatus();
  const panel = useChatPanel();
  const agents = useChatAgents(panel.available);
  const api = useChatApi();
  const toaster = useToaster();
  const { t } = useTranslation();
  const agent =
    newConversationAgent(agents.data, null) ?? agents.data?.[0] ?? null;
  const available = Boolean(panel.available && status.data?.available && agent);

  const ask = useCallback<ItamAi['ask']>(
    (prompt, options = {}) => {
      if (!agent) return;
      const pins = options.pins ?? [];
      if (options.autoSend === false) {
        panel.clearPinned();
        panel.openChat({ conversationId: null, view: 'chat', draft: prompt });
        for (const pin of pins) panel.openChat({ pin });
        panel.focusComposer();
        return;
      }
      const failed = () =>
        toaster.show({ type: 'error', title: t('ai.sendFailed') });
      void (async () => {
        const conversation = await api.createConversation({
          agentId: agent.id,
          source: ITAM_SOURCE,
        });
        panel.clearPinned();
        try {
          const context = buildPageContext({
            route: window.location.pathname,
            pinned: pins,
            sources: [],
            filter: null,
            selection: null,
            removed: new Set(),
          });
          await api.sendMessage(conversation.id, {
            content: prompt,
            clientId: crypto.randomUUID(),
            ...(context ? { context } : {}),
          });
          panel.openChat({ conversationId: conversation.id, view: 'chat' });
        } catch {
          failed();
          panel.openChat({
            conversationId: conversation.id,
            view: 'chat',
            draft: prompt,
          });
        }
      })().catch(failed);
    },
    [agent, api, panel, t, toaster],
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
