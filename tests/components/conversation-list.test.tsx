import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';

import { ConversationList } from '../../client/components/itam/ai/conversation-list.js';
import { markdownLine } from '../../client/lib/itam/conversations.js';

const state = vi.hoisted(() => ({
  messages: {} as Record<
    string,
    { role: string; parts: { type: 'text'; text: string }[] }
  >,
}));
vi.mock('@nocobase/app-plugin-agents/client/chat', () => ({
  appUIMessageText: (message: { parts: { text: string }[] }) =>
    message.parts.map((part) => part.text).join(''),
  AgentAvatar: ({ name }: { name: string }) => <span>{name[0]}</span>,
  useAgentText: () => ({ name: (agent: { name: string }) => agent.name }),
  useChatApi: () => ({
    messages: async (id: string) => ({
      items: state.messages[id] ? [state.messages[id]] : [],
    }),
  }),
}));
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { name?: string }) =>
      values?.name ? `${key}:${values.name}` : key,
    i18n: { language: 'en-US' },
  }),
}));

const conversation = (
  id: string,
  extra: Partial<{ title: string; read: boolean; source: string }> = {},
) => ({
  id,
  title: `Title ${id}`,
  read: true,
  source: 'itam',
  agent: { id: 'noco', name: 'Asset Steward' },
  lastMessageAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  run: null,
  ...extra,
});

const query = (items: ReturnType<typeof conversation>[]) =>
  ({
    data: { pages: [{ items }] },
    isLoading: false,
    error: null,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  }) as never;

const wrap = (children: ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/agent-chat/a']}>{children}</MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  state.messages = {
    a: {
      role: 'user',
      parts: [{ type: 'text', text: 'Which **laptops** are idle?' }],
    },
    b: {
      role: 'assistant',
      parts: [{ type: 'text', text: '- DE-000001\n- DE-000002' }],
    },
  };
});

// The conversations as NocoCRM lists them: each its title, time and latest
// message (whose it is first), a dot while a reply is unread, the global
// search's unkept answers left out; on the page a row is a link and the
// archived ones are behind a switch at the foot.
it('lists each conversation with its latest message, unread ones marked', async () => {
  wrap(
    <ConversationList
      query={query([
        conversation('a'),
        conversation('b', { read: false }),
        conversation('s', { source: 'itam-search' }),
      ])}
      openId='a'
      onArchived={() => undefined}
    />,
  );
  expect(screen.getByRole('link', { name: /Title a/ })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(screen.queryByText('Title s')).toBeNull();
  expect(
    await screen.findByText('ai.conversations.lastYours', { exact: false }),
  ).toHaveTextContent('ai.conversations.lastYoursWhich laptops are idle?');
  expect(
    await screen.findByText(/ai\.conversations\.lastFrom:Asset Steward/),
  ).toHaveTextContent('DE-000001 DE-000002');
  expect(screen.getAllByText('ai.conversations.unread')).toHaveLength(1);
});

it('switches to the archived ones from its foot', () => {
  const onArchived = vi.fn();
  wrap(
    <ConversationList
      query={query([conversation('a')])}
      openId={null}
      onArchived={onArchived}
    />,
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'ai.conversations.showArchived' }),
  );
  expect(onArchived).toHaveBeenCalledWith(true);
});

it('opens a row in place in the panel, with no switch', () => {
  const onOpen = vi.fn();
  wrap(
    <ConversationList
      query={query([conversation('a')])}
      openId={null}
      onOpen={onOpen}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /Title a/ }));
  expect(onOpen).toHaveBeenCalledWith('a');
  expect(
    screen.queryByRole('button', { name: 'ai.conversations.showArchived' }),
  ).toBeNull();
});

it('reads markdown as one plain line', () => {
  expect(
    markdownLine('## Due\n\n| a | b |\n|---|---|\n| [PO-1](/x) | **2** |'),
  ).toBe('Due a b PO-1 2');
});
