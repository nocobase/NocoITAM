import { createUuid, useToaster } from '@nocobase/app-client';
import {
  chatKeys,
  useChatAgents,
  useChatAttachments,
  useChatModels,
  useChatPanel,
  useConversationActions,
  type ChatContextItem,
} from '@nocobase/app-plugin-agents/client/chat';
import {
  CHAT_ATTACHMENT_SIZE_MAX,
  CHAT_ATTACHMENTS_PER_MESSAGE_MAX,
  type ChatAgent,
  type MessageAttachment,
} from '@nocobase/app-plugin-agents/shared/conversations';
import type { ModelRef } from '@nocobase/app-plugin-agents/shared/models';
import { useTranslation } from '@nocobase/i18n/client';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

import { AI_PATH, useAiStatus } from './ai.js';
import {
  contextOf,
  ITAM_AGENT,
  ITAM_SOURCE,
  useStartConversation,
} from './ai-chat.js';
import { useApi } from './api.js';
import { useDemoMode } from './demo-mode.js';

/** A question asked from the global search, answered in its dialog (`itam-agents/search-answers.ts`). */
export const SEARCH_SOURCE = 'itam-search';

/**
 * Asking the assistant from outside its panel (2026-10-16, after NocoCRM's
 * `agent-chat/ask.ts`): whether it can answer, the models a new conversation
 * may answer with, the files a question carries, asking at once (the ask box
 * at the bottom of pages) and opening a conversation about a record.
 */

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
 * Asset Steward, the native online agent ITAM's conversations go to
 * (`ITAM_AGENT`), and whether it can answer now: `/itam/ai/status` says
 * whether a usable model is there.
 */
export function useAgentReadiness(): AgentReadiness {
  const { t } = useTranslation();
  const panel = useChatPanel();
  const agents = useChatAgents(panel.available);
  const status = useAiStatus();
  const demo = useDemoMode();
  if (agents.isLoading || status.isLoading || demo.isLoading)
    return { state: 'loading', agent: null };
  const agent = agents.data?.find((item) => item.id === ITAM_AGENT) ?? null;
  // A Demo Mode deployment refuses every write, a new conversation's too
  // (2026-10-25): the boxes say so rather than take a question they cannot
  // send. The conversations the demo comes with can still be read.
  if (demo.data === true)
    return { state: 'unavailable', agent, reason: t('ai.demoReadOnly') };
  if (!agent || status.data?.available !== true)
    return { state: 'unavailable', agent, reason: t('ai.unavailable') };
  return { state: 'ready', agent };
}

/** A chat model a question may be answered with, named for the menu. */
export interface AskModel extends ModelRef {
  readonly serviceTitle: string;
  readonly modelLabel: string;
}

/** A model choice by a key a select can hold. */
export const modelKey = (model: ModelRef): string =>
  `${model.modelService}/${model.model}`;

const MODEL_KEY = 'nocoitam:agent-model';

/**
 * The chat models a new conversation may answer with (the plugin's catalog,
 * the default first, as `/itam/ai/status` names it) and the one picked for
 * the next conversation, which this browser remembers.
 */
export function useAskModels(): {
  readonly models: readonly AskModel[];
  readonly model: AskModel | undefined;
  readonly select: (key: string) => void;
} {
  const panel = useChatPanel();
  const catalog = useChatModels(panel.available);
  const status = useAiStatus();
  const fallback = status.data?.model ?? null;
  const models = useMemo(() => {
    const all = (catalog.data ?? []).flatMap((service) =>
      service.models
        .filter((item) => item.kind === 'chat')
        .map((item): AskModel => ({
          modelService: service.name,
          model: item.value,
          serviceTitle: service.title,
          modelLabel: item.label || item.value,
        })),
    );
    const first = fallback ? modelKey(fallback) : null;
    return [
      ...all.filter((item) => modelKey(item) === first),
      ...all.filter((item) => modelKey(item) !== first),
    ];
  }, [catalog.data, fallback]);
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
          uid: createUuid(),
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

/**
 * Asking the assistant at once from outside the panel: the conversation is
 * created with the question, then the panel opens on it. One not created
 * leaves the text with the caller (the promise rejects).
 */
export function useAskAgent(): (question: {
  readonly text: string;
  readonly items?: readonly ChatContextItem[];
  readonly attachments?: readonly MessageAttachment[];
  readonly model?: ModelRef;
  readonly agent: ChatAgent;
}) => Promise<void> {
  const start = useStartConversation();
  const panel = useChatPanel();
  return useCallback(
    async ({ text, items = [], attachments = [], model }) => {
      const context = contextOf(window.location.pathname, items);
      const conversationId = await start({
        content: text,
        source: ITAM_SOURCE,
        attachments,
        ...(context ? { context } : {}),
        ...(model ? { model } : {}),
      });
      panel.clearPinned();
      panel.openChat({ conversationId, view: 'chat' });
    },
    [start, panel],
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

/**
 * A question from the global search, answered in its dialog (2026-10-16,
 * after NocoCRM's): the conversation is created and the question sent,
 * nothing opened; its id comes back for the dialog to follow. Going on
 * asking keeps it (and opens the panel on it); leaving the answer discards
 * it, stopping a reply still being written first.
 */
export function useSearchAnswer(): {
  readonly start: (prompt: string) => Promise<string>;
  readonly keep: (conversationId: string, question: string) => Promise<void>;
  readonly discard: (conversationId: string, running: boolean) => void;
} {
  const startConversation = useStartConversation();
  const api = useApi();
  const panel = useChatPanel();
  const actions = useConversationActions();
  const queryClient = useQueryClient();
  return useMemo(
    () => ({
      start: (prompt) =>
        startConversation({ content: prompt, source: SEARCH_SOURCE }),
      keep: async (conversationId, question) => {
        await api.request({
          path: `${AI_PATH}/search-answers/${encodeURIComponent(conversationId)}/keep`,
          method: 'POST',
          json: { title: question.slice(0, 200) },
        });
        // Now one of ITAM's conversations, which the lists show.
        void queryClient.invalidateQueries({ queryKey: chatKeys.lists });
        panel.openChat({ conversationId, view: 'chat' });
        panel.focusComposer();
      },
      discard: (conversationId, running) => {
        void (async () => {
          if (running)
            await actions.stop
              .mutateAsync(conversationId)
              .catch(() => undefined);
          await api.request({
            path: `${AI_PATH}/search-answers/${encodeURIComponent(conversationId)}`,
            method: 'DELETE',
          });
        })().catch(() => undefined);
      },
    }),
    [startConversation, api, panel, actions.stop, queryClient],
  );
}
