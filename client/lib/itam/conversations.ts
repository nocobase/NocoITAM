import {
  useChatPanel,
  useConversationList,
} from '@nocobase/app-plugin-agents/client/chat';
import type { ConversationSummary } from '@nocobase/app-plugin-agents/shared/conversations';
import { useCallback, useEffect } from 'react';

import { SEARCH_SOURCE } from './ask.js';
import { useDemoMode } from '@nocobase/app-plugin-demo-mode/client';

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
 *
 * On a Demo Mode deployment (2026-10-25) it opens on the latest one, the
 * demo's first, unless the one it was left on is still among the account's:
 * the demo is reset daily and its accounts switched, so the panel's
 * remembered conversation was often gone and it opened on "cannot be
 * opened".
 */
export function useToggleAssistant(): () => void {
  const panel = useChatPanel();
  const list = useConversationList({});
  const demo = useDemoMode();
  const listed = listedConversations(list.data?.pages);
  const latest = listed[0]?.id ?? null;
  const { open, conversationId, closeChat, openChat } = panel;
  const gone =
    demo &&
    conversationId !== null &&
    list.isSuccess &&
    !listed.some((conversation) => conversation.id === conversationId);
  return useCallback(() => {
    if (open) closeChat();
    else if ((conversationId === null || gone) && latest)
      openChat({ conversationId: latest, view: 'chat' });
    else openChat();
  }, [open, conversationId, gone, latest, closeChat, openChat]);
}

/**
 * On a Demo Mode deployment, the panel open on a conversation the account no
 * longer has (it was open before the demo's daily reset, or under another
 * account) moves to the latest one, the demo's first (2026-10-25), rather
 * than say it cannot be opened.
 */
export function useDemoConversationFallback(): void {
  const panel = useChatPanel();
  const list = useConversationList({});
  const demo = useDemoMode();
  const listed = listedConversations(list.data?.pages);
  const latest = listed[0]?.id ?? null;
  const { open, conversationId, openChat } = panel;
  const gone =
    demo &&
    open &&
    conversationId !== null &&
    list.isSuccess &&
    !listed.some((conversation) => conversation.id === conversationId);
  useEffect(() => {
    if (gone && latest) openChat({ conversationId: latest, view: 'chat' });
  }, [gone, latest, openChat]);
}
