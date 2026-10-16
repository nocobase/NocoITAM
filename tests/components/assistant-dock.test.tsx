import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';

import { AssistantDock } from '../../client/components/itam/ai/assistant-dock.js';

const state = vi.hoisted(() => ({
  panelOpen: false,
  record: undefined as { kind: string; id: string; label: string } | undefined,
  dock: true as boolean | undefined,
  ready: true,
  ask: vi.fn(() => Promise.resolve()),
}));
vi.mock('@nocobase/app-plugin-agents/client/chat', () => ({
  useChatPanel: () => ({ open: state.panelOpen }),
  useChatSources: () => ({ items: state.record ? [state.record] : [] }),
}));
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { name?: string }) =>
      options?.name ? `${key}:${options.name}` : key,
  }),
}));
vi.mock('#hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('../../client/lib/itam/api.js', () => ({
  useItamSettings: () => ({ data: { ai: { assistantDock: state.dock } } }),
}));
vi.mock('../../client/lib/itam/ask.js', () => ({
  modelKey: (model: { modelService: string; model: string }) =>
    `${model.modelService}/${model.model}`,
  useAgentReadiness: () =>
    state.ready
      ? { state: 'ready', agent: { id: 'noco' } }
      : { state: 'unavailable', agent: null, reason: 'ai.unavailable' },
  useDiscuss: () => vi.fn(),
  useAgentModels: () => ({ models: [], model: undefined, select: vi.fn() }),
  useAskAgent: () => state.ask,
  useAskFiles: () => ({
    files: [],
    uploading: false,
    ready: [],
    upload: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
  }),
}));

beforeEach(() => {
  state.panelOpen = false;
  state.record = undefined;
  state.dock = true;
  state.ready = true;
  state.ask.mockClear();
});

const at = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AssistantDock />
    </MemoryRouter>,
  );

// The ask box at the bottom of pages, after NocoCRM's dock.
it('asks about the page, with the page suggesting questions', () => {
  at('/devices');
  const box = screen.getByRole('textbox', { name: 'ai.dock.placeholder' });
  fireEvent.focus(box);
  fireEvent.click(
    screen.getByRole('button', { name: /ai.dock.q.devices.idle/ }),
  );
  expect(state.ask).toHaveBeenCalledWith(
    expect.objectContaining({ text: 'ai.dock.q.devices.idle', items: [] }),
  );
});

it('asks about the record the page offers', () => {
  state.record = { kind: 'devices', id: 'd1', label: 'DE-000004' };
  at('/devices/d1');
  const box = screen.getByRole('textbox', {
    name: 'ai.dock.placeholder',
  });
  fireEvent.change(box, { target: { value: 'Is it under warranty?' } });
  fireEvent.keyDown(box, { key: 'Enter' });
  expect(state.ask).toHaveBeenCalledWith(
    expect.objectContaining({
      text: 'Is it under warranty?',
      items: [state.record],
    }),
  );
});

it('stays away where it would cover the page, and when switched off', () => {
  for (const path of ['/', '/settings/itam', '/agent-chat/c1']) {
    const { container, unmount } = at(path);
    expect(container.querySelector('textarea')).toBeNull();
    unmount();
  }
  state.dock = false;
  const { container } = at('/devices');
  expect(container.querySelector('textarea')).toBeNull();
});

it('says why it cannot answer, and takes no input', () => {
  state.ready = false;
  at('/devices');
  expect(
    screen.getByRole('textbox', { name: 'ai.unavailable' }),
  ).toBeDisabled();
});

it('closes once a question is sent, its suggestions not coming back', () => {
  at('/devices');
  const box = screen.getByRole('textbox', { name: 'ai.dock.placeholder' });
  fireEvent.focus(box);
  expect(screen.getByRole('list')).toBeTruthy();
  fireEvent.change(box, { target: { value: 'Which are idle?' } });
  fireEvent.keyDown(box, { key: 'Enter' });
  expect(state.ask).toHaveBeenCalled();
  expect(screen.queryByRole('list')).toBeNull();
});

it('gets focus back, still one line, when the panel closes', () => {
  const { rerender } = at('/devices');
  state.panelOpen = true;
  rerender(
    <MemoryRouter initialEntries={['/devices']}>
      <AssistantDock />
    </MemoryRouter>,
  );
  state.panelOpen = false;
  rerender(
    <MemoryRouter initialEntries={['/devices']}>
      <AssistantDock />
    </MemoryRouter>,
  );
  const box = screen.getByRole('textbox', { name: 'ai.dock.placeholder' });
  expect(box).toHaveFocus();
  // Not opened by itself: no suggestions until pressed.
  expect(screen.queryByRole('list')).toBeNull();
  fireEvent.pointerDown(box);
  expect(screen.getByRole('list')).toBeTruthy();
});
