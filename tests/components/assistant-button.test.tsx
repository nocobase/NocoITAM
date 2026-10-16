import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { AgentChatButton } from '../../client/layouts/agent-chat.js';
import { TooltipProvider } from '../../client/components/ui/tooltip.js';

const state = vi.hoisted(() => ({
  status: { isLoading: false, data: { available: true } } as {
    isLoading: boolean;
    data?: { available: boolean };
  },
  toggle: vi.fn(),
}));
vi.mock('@nocobase/app-plugin-agents/client/chat', () => ({
  CHAT_PANEL_ID: 'chat-panel',
  ChatExtensionsContext: { Provider: () => null },
  ChatProvider: () => null,
  useChatPanel: () => ({
    available: true,
    open: false,
    toggleChat: state.toggle,
  }),
}));
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('../../client/lib/itam/ai.js', () => ({
  useAiStatus: () => state.status,
}));
vi.mock('#extensions/nocobase-agent-chat/chat-panel', () => ({
  ChatPanel: () => null,
}));
vi.mock('#extensions/nocobase-agent-chat/launchers', () => ({
  ChatFloatingButton: () => null,
}));

beforeEach(() => {
  state.toggle.mockClear();
  state.status = { isLoading: false, data: { available: true } };
});

const renderButton = () =>
  render(
    <TooltipProvider>
      <AgentChatButton />
    </TooltipProvider>,
  );

// The header's ✨, after NocoCRM's: it toggles the panel as ⌘J does, and
// while the assistant cannot answer it stays, disabled, saying why.
it('toggles the panel', () => {
  renderButton();
  fireEvent.click(screen.getByRole('button', { name: 'ai.ask' }));
  expect(state.toggle).toHaveBeenCalledOnce();
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
