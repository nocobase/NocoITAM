import { renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import {
  useDemoConversationFallback,
  useToggleAssistant,
} from '../../client/lib/itam/conversations.js';

const state = vi.hoisted(() => ({
  demo: false,
  open: false,
  conversationId: null as string | null,
  openChat: vi.fn(),
}));
vi.mock('@nocobase/app-plugin-agents/client/chat', () => ({
  useChatPanel: () => ({
    open: state.open,
    conversationId: state.conversationId,
    closeChat: vi.fn(),
    openChat: state.openChat,
  }),
  useConversationList: () => ({
    isSuccess: true,
    data: { pages: [{ items: [{ id: 'leaver' }, { id: 'loans' }] }] },
  }),
}));
vi.mock('../../client/lib/itam/demo-mode.js', () => ({
  useDemoMode: () => ({ data: state.demo }),
}));

beforeEach(() => {
  state.demo = false;
  state.open = false;
  state.conversationId = null;
  state.openChat.mockClear();
});

const toggle = () => renderHook(() => useToggleAssistant()).result.current();

it('opens on the latest conversation when it holds none', () => {
  toggle();
  expect(state.openChat).toHaveBeenCalledWith({
    conversationId: 'leaver',
    view: 'chat',
  });
});

it('opens where it was left', () => {
  state.conversationId = 'gone';
  toggle();
  expect(state.openChat).toHaveBeenCalledWith();
});

// The demo is reset daily and its accounts switched (2026-10-25): a
// conversation the panel remembers that the account no longer has gives way
// to the demo's first.
it('opens on the demo’s first when the one it was left on is gone', () => {
  state.demo = true;
  state.conversationId = 'gone';
  toggle();
  expect(state.openChat).toHaveBeenCalledWith({
    conversationId: 'leaver',
    view: 'chat',
  });
  state.openChat.mockClear();
  state.conversationId = 'loans';
  toggle();
  expect(state.openChat).toHaveBeenCalledWith();
});

it('moves the open panel off a conversation gone with the demo’s reset', () => {
  state.demo = true;
  state.open = true;
  state.conversationId = 'gone';
  renderHook(() => useDemoConversationFallback());
  expect(state.openChat).toHaveBeenCalledWith({
    conversationId: 'leaver',
    view: 'chat',
  });
  state.openChat.mockClear();
  state.demo = false;
  renderHook(() => useDemoConversationFallback());
  expect(state.openChat).not.toHaveBeenCalled();
});
