import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { MasterEnrichDialog } from '../../client/components/itam/master-enrich-dialog.js';

const state = vi.hoisted(() => ({
  asked: [] as { message: string; options: unknown }[],
  saved: [] as unknown[],
  chat: { status: 'ready', messages: [] } as Record<string, unknown>,
  tools: [] as {
    name: string;
    execute: (args: unknown) => Promise<unknown>;
  }[],
}));

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number; name?: string }) =>
      options?.count !== undefined ? `${key}:${options.count}` : key,
  }),
}));
vi.mock('../../client/lib/itam/api.js', () => ({
  apiErrorBody: () => undefined,
  masterDataPath: (collection: string) => `itam/master/${collection}`,
  useApi: () => ({
    request: () =>
      Promise.resolve({
        data: {
          values: {
            name: 'Latitude 5440 Notebook',
            code: '210-BFZY',
            warrantyMonths: 36,
            releaseDate: '2023-05-10',
            categoryId: 'cat-laptop',
            attributes: { cpu: 'Intel Core i7-1365U', screenSize: '14' },
          },
          manufacturerName: null,
          duplicates: [],
          similar: [],
          uncertain: ['attributes.cpu'],
          sources: [{ title: 'Dell spec sheet', url: 'https://dell.example' }],
        },
      }),
  }),
  useItamList: () => ({ data: { data: [] } }),
  useItamRecord: (path: string, id?: string) => ({
    data:
      path === 'itam/master/categories' && id
        ? {
            id,
            fieldTemplate: [
              { key: 'cpu', label: 'CPU', type: 'text' },
              { key: 'screenSize', label: 'Screen', type: 'text' },
            ],
          }
        : undefined,
  }),
  useItamMutations: () => ({
    update: {
      mutateAsync: (input: unknown) => {
        state.saved.push(input);
        return Promise.resolve({});
      },
      reset: vi.fn(),
      isPending: false,
      error: undefined,
    },
  }),
}));
vi.mock('../../client/lib/itam/references.js', () => ({
  referencePath: (collection: string) => `itam/master/${collection}`,
  useReferenceNames: () => ({
    manufacturers: new Map([['mfr-dell', 'Dell']]),
    categories: new Map([['cat-laptop', 'Laptop']]),
  }),
}));
vi.mock('../../client/lib/itam/ai-chat.js', () => ({
  useItamAi: () => ({
    available: true,
    master: {
      ask: (message: string, _context: unknown, options: unknown) =>
        state.asked.push({ message, options }),
      state: {
        get: () => ({
          ...state.chat,
          removeConversation: () => Promise.resolve(),
        }),
      },
    },
  }),
  useHiddenChat: () => state.chat,
  messageText: (message: { parts: { type: string; text?: string }[] }) =>
    message.parts.map((part) => part.text ?? '').join(''),
}));
vi.mock('../../client/extensions/nocobase-ai/index.js', () => ({
  useAI: () => ({
    models: [{ value: 'searcher', llmService: 'svc', supportWebSearch: true }],
  }),
  useAIPageElementHandle: (descriptor: { tools?: typeof state.tools }) => {
    state.tools = descriptor.tools ?? [];
    return { ref: () => undefined, context: {} };
  },
}));

beforeEach(() => {
  state.asked = [];
  state.saved = [];
  state.tools = [];
  state.chat = { status: 'ready', messages: [] };
});

const record = {
  id: 'model-latitude-5440',
  name: 'Latitude 5440',
  code: '210-BFZY',
  manufacturerId: 'mfr-dell',
  categoryId: 'cat-laptop',
  warrantyMonths: 12,
  releaseDate: null,
  attributes: { cpu: 'Intel Core i5-1335U' },
};

it('lists what differs from the record and saves only what is ticked', async () => {
  const dialog = () => (
    <MasterEnrichDialog
      collection='models'
      record={record}
      open
      onOpenChange={vi.fn()}
    />
  );
  const view = render(dialog());
  // It starts on opening, from the maker, the name and the part code, in
  // the enrich mode of the catalog skill.
  expect(state.asked).toHaveLength(1);
  expect(state.asked[0]!.message).toContain('ai.prompts.enrichModel');
  expect(state.asked[0]!.message).toContain('Dell Latitude 5440');
  expect(state.asked[0]!.message).toContain('210-BFZY');
  expect(state.asked[0]!.options).toMatchObject({
    skillSettings: { skills: ['catalog'], tools: [] },
  });

  const fill = state.tools.find((tool) => tool.name === 'fillModel');
  await act(async () => {
    await fill!.execute({});
  });
  // The turn ends with the assistant's sentence.
  state.chat = {
    status: 'ready',
    conversationId: 'c1',
    messages: [
      {
        role: 'user',
        parts: [{ type: 'text', text: state.asked[0]!.message }],
      },
      {
        role: 'assistant',
        parts: [
          { type: 'text', text: 'Added the release date; the CPU differs.' },
        ],
      },
    ],
  };
  view.rerender(dialog());
  expect(
    screen.getByText('Added the release date; the CPU differs.'),
  ).toBeVisible();

  // The part code agrees, so it is not listed; the rest differ.
  const box = (label: string) => screen.getByRole('checkbox', { name: label });
  expect(
    screen.queryByRole('checkbox', { name: 'fields.modelCode' }),
  ).toBeNull();
  // Empty on the books: ticked.
  expect(box('fields.releaseDate')).toHaveAttribute('aria-checked', 'true');
  expect(box('Screen')).toHaveAttribute('aria-checked', 'true');
  // A value that would change, and the name: offered, not ticked.
  expect(box('fields.warrantyMonths')).toHaveAttribute('aria-checked', 'false');
  expect(box('CPU')).toHaveAttribute('aria-checked', 'false');
  expect(box('fields.name')).toHaveAttribute('aria-checked', 'false');
  expect(screen.getByRole('link', { name: 'Dell spec sheet' })).toBeVisible();

  // Taking the CPU too, then applying.
  fireEvent.click(box('CPU'));
  await act(async () => {
    fireEvent.click(
      screen.getByRole('button', { name: 'masterEnrich.apply:3' }),
    );
  });
  expect(state.saved).toEqual([
    {
      id: 'model-latitude-5440',
      input: {
        releaseDate: '2023-05-10',
        attributes: { cpu: 'Intel Core i7-1365U', screenSize: '14' },
      },
    },
  ]);
});
