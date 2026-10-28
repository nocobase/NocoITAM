import { renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { useAgentReadiness } from '../../client/lib/itam/ask.js';

const state = vi.hoisted(() => ({
  demo: false,
  available: true,
}));
vi.mock('@nocobase/app-plugin-agents/client/chat', () => ({
  chatKeys: {},
  useChatPanel: () => ({ available: true }),
  useChatAgents: () => ({ isLoading: false, data: [{ id: 'online' }] }),
}));
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('../../client/lib/itam/ai.js', () => ({
  AI_PATH: '/ai',
  useAiStatus: () => ({
    isLoading: false,
    data: { available: state.available },
  }),
}));
vi.mock('@nocobase/app-plugin-demo-mode/client', () => ({
  useDemoMode: () => state.demo,
}));

beforeEach(() => {
  state.demo = false;
  state.available = true;
});

it('is ready with a model, outside Demo Mode', () => {
  expect(renderHook(() => useAgentReadiness()).result.current.state).toBe(
    'ready',
  );
});

// Demo Mode refuses a new conversation's writes (2026-10-25): the boxes say
// so rather than take a question they cannot send.
it('cannot take a question in Demo Mode, and says why', () => {
  state.demo = true;
  expect(renderHook(() => useAgentReadiness()).result.current).toMatchObject({
    state: 'unavailable',
    reason: 'ai.demoReadOnly',
  });
});
