import { useToaster } from '@nocobase/app-client';
import {
  buildPageContext,
  newConversationAgent,
  useChatAgents,
  useChatApi,
  useChatAttachments,
  useChatPanel,
  type ChatContextItem,
} from '@nocobase/app-plugin-agents/client/chat';
import {
  CHAT_ATTACHMENT_SIZE_MAX,
  CHAT_ATTACHMENTS_PER_MESSAGE_MAX,
  type ChatAgent,
  type ChatModelChoice,
  type MessageAttachment,
} from '@nocobase/app-plugin-agents/shared/conversations';
import { useTranslation } from '@nocobase/i18n/client';
import { useCallback, useMemo, useState } from 'react';

import { useAiStatus } from './ai.js';
import { ITAM_SOURCE } from './ai-chat.js';

/**
 * Asking the assistant from outside its panel (2026-10-16, after NocoCRM's
 * `agent-chat/ask.ts`): whether it can answer, the models a new conversation
 * may answer with, the files a question carries, asking at once (the ask box
 * at the bottom of pages) and opening a conversation about a record.
 */

const newClientId = (): string => crypto.randomUUID();

export type AgentReadiness =
  | {
      readonly state: 'loading';
      readonly agent: null;
      readonly reason?: undefined;
    }
  | {
      readonly state: 'ready';
      readonly agent: ChatAgent;
      readonly reason?: undefined;
    }
  | {
      readonly state: 'unavailable';
      readonly agent: ChatAgent | null;
      readonly reason: string;
    };

/**
 * The agent a new conversation goes to, as the plugin picks it, and whether
 * it can answer now: `/itam/ai/status` says whether a usable model is there.
 */
export function useAgentReadiness(): AgentReadiness {
  const { t } = useTranslation();
  const panel = useChatPanel();
  const agents = useChatAgents(panel.available);
  const status = useAiStatus();
  if (agents.isLoading || status.isLoading)
    return { state: 'loading', agent: null };
  const agent =
    newConversationAgent(agents.data, null) ?? agents.data?.[0] ?? null;
  if (!agent || status.data?.available !== true)
    return { state: 'unavailable', agent, reason: t('ai.unavailable') };
  return { state: 'ready', agent };
}

/** A model choice by a key a select can hold. */
export const modelKey = (
  model: Pick<ChatModelChoice, 'modelService' | 'model'>,
): string => `${model.modelService}/${model.model}`;

const MODEL_KEY = 'nocoitam:agent-model';

/**
 * The models the agent lists (its first the default) and the one picked for
 * the next conversation, which this browser remembers.
 */
export function useAgentModels(agent: ChatAgent | null): {
  readonly models: readonly ChatModelChoice[];
  readonly model: ChatModelChoice | undefined;
  readonly select: (key: string) => void;
} {
  const models = useMemo(() => agent?.models ?? [], [agent]);
  const [key, setKey] = useState(() => {
    try {
      return localStorage.getItem(MODEL_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const select = useCallback((next: string): void => {
    setKey(next);
    try {
      localStorage.setItem(MODEL_KEY, next);
    } catch {
      // Storage may be unavailable; the choice then lasts for the page.
    }
  }, []);
  return {
    models,
    model: models.find((item) => modelKey(item) === key) ?? models[0],
    select,
  };
}

/** A file a question carries: uploading, sent once done, or refused. */
export interface AskFile {
  readonly uid: string;
  readonly filename: string;
  readonly size: number;
  readonly mimeType: string;
  readonly status: 'uploading' | 'done' | 'error';
  readonly attachment?: MessageAttachment;
  readonly error?: string;
}

export interface AskFiles {
  readonly files: readonly AskFile[];
  readonly uploading: boolean;
  readonly ready: readonly MessageAttachment[];
  readonly upload: (files: readonly File[]) => void;
  readonly remove: (uid: string) => void;
  readonly clear: () => void;
}

/**
 * The files of a question, uploaded through the plugin as soon as they are
 * picked, within its limits (size, count).
 */
export function useAskFiles(): AskFiles {
  const { t } = useTranslation();
  const toaster = useToaster();
  const uploads = useChatAttachments();
  const [files, setFiles] = useState<readonly AskFile[]>([]);
  const upload = useCallback(
    (picked: readonly File[]): void => {
      const room = CHAT_ATTACHMENTS_PER_MESSAGE_MAX - files.length;
      if (picked.length > room)
        toaster.show({
          type: 'error',
          title: t('ai.dock.tooManyFiles', {
            count: CHAT_ATTACHMENTS_PER_MESSAGE_MAX,
          }),
        });
      const accepted = picked.slice(0, Math.max(0, room)).filter((file) => {
        if (file.size <= CHAT_ATTACHMENT_SIZE_MAX) return true;
        toaster.show({
          type: 'error',
          title: t('ai.dock.fileTooLarge', { name: file.name }),
        });
        return false;
      });
      const pending = accepted.map((file) => ({
        file,
        entry: {
          uid: newClientId(),
          filename: file.name || `pasted-${String(Date.now())}`,
          size: file.size,
          mimeType: file.type,
          status: 'uploading' as const,
        } satisfies AskFile,
      }));
      setFiles((current) => [...current, ...pending.map(({ entry }) => entry)]);
      const settle = (uid: string, change: Partial<AskFile>): void =>
        setFiles((list) =>
          list.map((item) =>
            item.uid === uid ? { ...item, ...change } : item,
          ),
        );
      for (const { file, entry } of pending)
        uploads.upload(file).then(
          (attachment) => settle(entry.uid, { status: 'done', attachment }),
          (error: unknown) => {
            settle(entry.uid, {
              status: 'error',
              ...(error instanceof Error ? { error: error.message } : {}),
            });
            toaster.show({
              type: 'error',
              title: t('ai.dock.uploadFailed', { name: entry.filename }),
            });
          },
        );
    },
    [files.length, t, toaster, uploads],
  );
  const remove = useCallback(
    (uid: string) => {
      const gone = files.find((item) => item.uid === uid);
      if (gone?.attachment) uploads.discard(gone.attachment);
      setFiles((current) => current.filter((item) => item.uid !== uid));
    },
    [files, uploads],
  );
  const clear = useCallback(() => setFiles([]), []);
  return {
    files,
    uploading: files.some((item) => item.status === 'uploading'),
    ready: files.flatMap((item) =>
      item.status === 'done' && item.attachment ? [item.attachment] : [],
    ),
    upload,
    remove,
    clear,
  };
}

/** The page context a question is sent with: the given items only. */
export function contextOf(route: string, items: readonly ChatContextItem[]) {
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
 * Asking the assistant at once from outside the panel: the conversation is
 * created and the question sent, then the panel opens on it. A conversation
 * created whose message did not go opens with the text in its composer; one
 * not created leaves the text with the caller (the promise rejects).
 */
export function useAskAgent(): (question: {
  readonly text: string;
  readonly items?: readonly ChatContextItem[];
  readonly attachments?: readonly MessageAttachment[];
  readonly model?: ChatModelChoice;
  readonly agent: ChatAgent;
}) => Promise<void> {
  const api = useChatApi();
  const panel = useChatPanel();
  const toaster = useToaster();
  const { t } = useTranslation();
  return useCallback(
    async ({ text, items = [], attachments = [], model, agent }) => {
      const conversation = await api.createConversation({
        agentId: agent.id,
        source: ITAM_SOURCE,
        ...(model
          ? { model: { modelService: model.modelService, model: model.model } }
          : {}),
      });
      panel.clearPinned();
      try {
        const context = contextOf(window.location.pathname, items);
        await api.sendMessage(conversation.id, {
          content: text,
          clientId: newClientId(),
          ...(context ? { context } : {}),
          ...(attachments.length
            ? { attachmentIds: attachments.map((file) => file.id) }
            : {}),
        });
        panel.openChat({ conversationId: conversation.id, view: 'chat' });
      } catch {
        toaster.show({ type: 'error', title: t('ai.sendFailed') });
        panel.openChat({
          conversationId: conversation.id,
          view: 'chat',
          draft: text,
        });
      }
    },
    [api, panel, toaster, t],
  );
}

/**
 * A new conversation about the given records, sending nothing: the earlier
 * pins are dropped first, so a second call replaces them.
 */
export function useDiscuss(): (pins: readonly ChatContextItem[]) => void {
  const panel = useChatPanel();
  return useCallback(
    (pins) => {
      panel.clearPinned();
      panel.openChat({ conversationId: null, view: 'chat' });
      for (const pin of pins) panel.openChat({ pin });
      panel.focusComposer();
    },
    [panel],
  );
}
