import {
  useChatPanel,
  type ChatContextItem,
} from '@nocobase/app-plugin-agents/client/chat';
import { useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useRef, useState } from 'react';

import {
  useAskModels,
  useAgentReadiness,
  useAskAgent,
  useAskFiles,
  type AskFiles,
  type AskModel,
} from '@/lib/itam/ask';
import { ITAM_AGENT } from '@/lib/itam/ai-chat';
import { useDemoMode } from '@nocobase/app-plugin-demo-mode/client';
import { errorMessage } from '@/lib/itam/format';

/**
 * When the panel closes, focus left inside it (or fallen to the page) comes
 * back to the box `target` gives; focus the reader put elsewhere stays
 * (after NocoCRM's `assistant-ask.ts`).
 */
export function useFocusReturn(
  target: () => HTMLElement | null | undefined,
): void {
  const panelOpen = useChatPanel().open;
  const wasOpenRef = useRef(panelOpen);
  useEffect(() => {
    if (wasOpenRef.current && !panelOpen) {
      const active = document.activeElement;
      const stranded =
        !active ||
        active === document.body ||
        !active.isConnected ||
        (typeof active.checkVisibility === 'function' &&
          !active.checkVisibility());
      if (stranded) target()?.focus();
    }
    wasOpenRef.current = panelOpen;
  }, [panelOpen, target]);
}

/**
 * A question being written in the ask box: its text, its files and the
 * model picked, and sending it, which starts a conversation (about the
 * page's record, when there is one) and opens the panel on it.
 */
export interface AskDraft {
  readonly value: string;
  readonly setValue: (value: string) => void;
  readonly files: AskFiles;
  readonly models: readonly AskModel[];
  readonly model: AskModel | undefined;
  readonly selectModel: (key: string) => void;
  readonly canSend: boolean;
  readonly sending: boolean;
  /** Sends the text given (a suggested question) or else the box's own. */
  readonly send: (prompt?: string) => boolean;
}

export function useAskDraft(
  record: ChatContextItem | undefined,
  disabled: boolean,
): AskDraft {
  const { t } = useTranslation();
  const toaster = useToaster();
  const panel = useChatPanel();
  const demo = useDemoMode();
  const readiness = useAgentReadiness();
  const files = useAskFiles();
  const { models, model, select } = useAskModels();
  const askAgent = useAskAgent();
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const blocked = disabled || sending || files.uploading;
  const send = (prompt?: string): boolean => {
    const question = (prompt ?? value).trim();
    const agent = readiness.agent;
    // On a Demo Mode deployment, which refuses a new conversation, the
    // question still opens the panel (2026-10-25): a new conversation with
    // it in the composer, which says the demo cannot send it. Asking from a
    // page then reads as it does anywhere else, up to the send.
    if (demo) {
      if (blocked || !question) return false;
      setValue('');
      files.clear();
      panel.clearPinned();
      panel.openChat({
        conversationId: null,
        agentId: ITAM_AGENT,
        view: 'chat',
        draft: question,
      });
      if (record) panel.openChat({ pin: record });
      return true;
    }
    if (blocked || !agent || (!question && !files.ready.length)) return false;
    const typed = value;
    const attachments = files.ready;
    setValue('');
    files.clear();
    setSending(true);
    askAgent({
      text: question,
      agent,
      attachments,
      ...(model ? { model } : {}),
      items: record ? [record] : [],
    })
      // Not even created: the question comes back to the box, and the
      // reader is told why (2026-10-25: a refused send used to leave the
      // box open on the question with no word of it).
      .catch((error: unknown) => {
        setValue(typed);
        toaster.show({
          type: 'error',
          title: t('ai.askFailed'),
          description: errorMessage(error) || undefined,
        });
      })
      .finally(() => setSending(false));
    return true;
  };
  return {
    value,
    setValue,
    files,
    models,
    model,
    selectModel: select,
    canSend: !blocked && Boolean(value.trim() || files.ready.length),
    sending,
    send,
  };
}
