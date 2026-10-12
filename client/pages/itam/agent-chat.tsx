import type { ReactElement } from 'react';
import { Navigate, useParams } from 'react-router';

import { ChatConversationPage } from '#extensions/nocobase-agent-chat/conversation-page';

/**
 * One conversation with the assistant as a page of its own
 * (`/agent-chat/:conversationId`), the chat panel's "open as a page" — the
 * UI Library's agent-chat block on the Agents plugin. A conversation is its
 * owner's alone; the plugin answers nobody else for it.
 */
export default function AgentChatPage(): ReactElement {
  const { conversationId } = useParams();
  if (!conversationId) return <Navigate to='/' replace />;
  return (
    <ChatConversationPage
      conversationId={conversationId}
      newConversationPath='/'
    />
  );
}
