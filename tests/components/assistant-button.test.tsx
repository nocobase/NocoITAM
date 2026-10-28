import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { AgentChatButton } from '../../client/layouts/agent-chat.js';
import { TooltipProvider } from '../../client/components/ui/tooltip.js';

const state = vi.hoisted(() => ({
  status: { isLoading: false, data: { available: true } } as {
    isLoading: boolean;
    data?: { available: boolean };
  },
  panel: { open: false, conversationId: null as string | null },
  items: [] as { id: string; source: string }[],
  openChat: vi.fn(),
  closeChat: vi.fn(),
}));
vi.mock('@nocobase/app-plugin-agents/client/chat', () => ({
  CHAT_PANEL_ID: 'chat-panel',
  ChatExtensionsContext: { Provider: () => null },
  ChatProvider: () => null,
  useChatPanel: () => ({
    available: true,
    ...state.panel,
    openChat: state.openChat,
    closeChat: state.closeChat,
  }),
  useConversationList: () => ({ data: { pages: [{ items: state.items }] } }),
}));
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('../../client/lib/itam/ai.js', () => ({
  useAiStatus: () => state.status,
}));
// Not a Demo Mode deployment (`useToggleAssistant` asks, 2026-10-25).
vi.mock('@nocobase/app-plugin-demo-mode/client', () => ({
  useDemoMode: () => false,
}));
vi.mock('#extensions/nocobase-agent-chat/chat-panel', () => ({
  ChatPanel: () => null,
}));
vi.mock('#extensions/nocobase-agent-chat/launchers', () => ({
  ChatFloatingButton: () => null,
}));

beforeEach(() => {
  state.openChat.mockClear();
  state.closeChat.mockClear();
  state.status = { isLoading: false, data: { available: true } };
  state.panel = { open: false, conversationId: null };
  state.items = [
    { id: 'answer', source: 'itam-search' },
    { id: 'latest', source: 'itam' },
    { id: 'older', source: 'panel' },
  ];
});

const renderButton = () =>
  render(
    <TooltipProvider>
      <AgentChatButton />
    </TooltipProvider>,
  );

// The header's ✨, after NocoCRM's: it opens the panel where it was left, on
// the latest conversation when it holds none, and closes it when open; while
// the assistant cannot answer it stays, disabled, saying why.
it('opens on the latest conversation, past the search’s answers', () => {
  renderButton();
  fireEvent.click(screen.getByRole('button', { name: 'ai.ask' }));
  expect(state.openChat).toHaveBeenCalledWith({
    conversationId: 'latest',
    view: 'chat',
  });
});

it('opens where it was left when it holds a conversation', () => {
  state.panel = { open: false, conversationId: 'older' };
  renderButton();
  fireEvent.click(screen.getByRole('button', { name: 'ai.ask' }));
  expect(state.openChat).toHaveBeenCalledWith();
});

it('opens a new conversation when there is none yet', () => {
  state.items = [];
  renderButton();
  fireEvent.click(screen.getByRole('button', { name: 'ai.ask' }));
  expect(state.openChat).toHaveBeenCalledWith();
});

it('closes the panel when it is open', () => {
  state.panel = { open: true, conversationId: 'latest' };
  renderButton();
  fireEvent.click(screen.getByRole('button', { name: 'ai.ask' }));
  expect(state.closeChat).toHaveBeenCalledOnce();
  expect(state.openChat).not.toHaveBeenCalled();
});

it('stays disabled with the reason while the assistant cannot answer', () => {
  state.status = { isLoading: false, data: { available: false } };
  renderButton();
  expect(screen.getByRole('button', { name: 'ai.unavailable' })).toBeDisabled();
});

it('draws nothing until the status is known', () => {
  state.status = { isLoading: true };
  const { container } = renderButton();
  expect(container.querySelector('button')).toBeNull();
});
