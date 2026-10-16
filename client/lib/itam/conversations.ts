import {
  useChatPanel,
  useConversationList,
} from '@nocobase/app-plugin-agents/client/chat';
import type { ConversationSummary } from '@nocobase/app-plugin-agents/shared/conversations';
import { useCallback } from 'react';

import { SEARCH_SOURCE } from './ask.js';

/**
 * The assistant's conversations as ITAM lists them (2026-10-16, after
 * NocoCRM's `agent-chat`): the conversations page, the panel's history and
 * the header button's latest conversation.
 */

/** The conversations a list shows: every page's, the global search's unkept answers left out. */
export function listedConversations(
  pages:
    readonly { readonly items: readonly ConversationSummary[] }[] | undefined,
): ConversationSummary[] {
  return (pages ?? [])
    .flatMap((page) => page.items)
    .filter((conversation) => conversation.source !== SEARCH_SOURCE);
}

/** Markdown as one plain line: code blocks, marks, links' targets and list markers dropped. */
export function markdownLine(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/gm, '')
    .replace(/^\s*\|?\s*:?-{3,}.*$/gm, '')
    .replace(/(\*\*|__|~~|`)/g, '')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Opening the assistant from the header's ✨ button or a phone's round
 * button (2026-10-16): open, it closes; closed, it opens where it was left,
 * or — holding no conversation, as on arriving — on the latest one, a new
 * conversation being the panel's +.
 */
export function useToggleAssistant(): () => void {
  const panel = useChatPanel();
  const list = useConversationList({});
  const latest = listedConversations(list.data?.pages)[0]?.id ?? null;
  const { open, conversationId, closeChat, openChat } = panel;
  return useCallback(() => {
    if (open) closeChat();
    else if (conversationId === null && latest)
      openChat({ conversationId: latest, view: 'chat' });
    else openChat();
  }, [open, conversationId, latest, closeChat, openChat]);
}
