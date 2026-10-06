import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { MasterCreateDialog } from '../../client/components/itam/master-create-dialog.js';

const state = vi.hoisted(() => ({
  available: true,
  searchModel: true,
  asked: [] as { message: string; options: unknown }[],
  requests: [] as { path: string; json?: unknown }[],
  created: [] as unknown[],
  chat: { status: 'ready', messages: [] } as Record<string, unknown>,
  removed: [] as string[],
  tools: [] as {
    name: string;
    execute: (args: unknown) => Promise<unknown>;
  }[],
}));

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { name?: string }) =>
      options?.name !== undefined ? `${key}:${options.name}` : key,
  }),
}));
vi.mock('@nocobase/app-client', () => ({
  resolveAppUrl: (path: string) => `/main${path}`,
}));
vi.mock('../../client/lib/itam/api.js', () => ({
  apiErrorBody: () => undefined,
  masterDataPath: (collection: string) => `itam/master/${collection}`,
  useApi: () => ({
    request: (input: { path: string; json?: unknown }) => {
      state.requests.push(input);
      return Promise.resolve({
        data: {
          values: {
            name: 'OptiPlex 7010 SFF',
            code: 'OPT7010SFF',
            categoryId: 'cat-desktop',
            warrantyMonths: 36,
          },
          manufacturerName: 'Dell Technologies',
          duplicates: [{ id: 'm9', name: 'OptiPlex 7010' }],
          uncertain: ['code'],
          sources: [
            { title: 'Dell spec sheet', url: 'https://dell.example/7010' },
          ],
        },
      });
    },
  }),
  useItamList: () => ({
    data: {
      data: [
        { id: 'cat-desktop', name: 'Desktop', appliesTo: 'device' },
        { id: 'cat-saas', name: 'SaaS', appliesTo: 'entitlement' },
      ],
    },
  }),
  useItamRecord: () => ({ data: undefined }),
  useItamMutations: () => ({
    create: {
      mutateAsync: (values: unknown) => {
        state.created.push(values);
        return Promise.resolve({ id: 'new' });
      },
      reset: vi.fn(),
      isPending: false,
      error: undefined,
    },
  }),
}));
vi.mock('../../client/lib/itam/references.js', () => ({
  referencePath: (collection: string) => `itam/master/${collection}`,
  useReferenceNames: () => ({}),
}));
vi.mock('../../client/lib/itam/permissions.js', () => ({
  useCollectionPermissions: () => ({ create: true }),
}));
vi.mock('../../client/lib/itam/ai-chat.js', () => ({
  useItamAi: () =>
    state.available
      ? {
          available: true,
          master: {
            ask: (message: string, _context: unknown, options: unknown) =>
              state.asked.push({ message, options }),
            state: {
              get: () => ({
                ...state.chat,
                removeConversation: (id: string) => {
                  state.removed.push(id);
                  return Promise.resolve();
                },
              }),
            },
          },
        }
      : undefined,
  useHiddenChat: () => state.chat,
  messageText: (message: { parts: { type: string; text?: string }[] }) =>
    message.parts.map((part) => part.text ?? '').join(''),
}));
vi.mock('../../client/extensions/nocobase-ai/index.js', () => ({
  useAI: () => ({
    models: state.searchModel
      ? [
          { value: 'plain', llmService: 'svc', supportWebSearch: false },
          { value: 'searcher', llmService: 'svc', supportWebSearch: true },
        ]
      : [{ value: 'plain', llmService: 'svc', supportWebSearch: false }],
  }),
  useAIPageElementHandle: (descriptor: { tools?: typeof state.tools }) => {
    state.tools = descriptor.tools ?? [];
    return { ref: () => undefined, context: {} };
  },
}));
vi.mock('../../client/components/itam/field-input.js', () => ({
  // A plain input per field, so the filled values can be read.
  FieldInput: ({
    id,
    value,
    onChange,
  }: {
    id: string;
    value: unknown;
    onChange: (value: unknown) => void;
  }) => (
    <input
      id={id}
      aria-label={id}
      value={value === null || value === undefined ? '' : String(value)}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

beforeEach(() => {
  state.available = true;
  state.searchModel = true;
  state.asked = [];
  state.requests = [];
  state.created = [];
  state.tools = [];
  state.chat = { status: 'ready', messages: [] };
  state.removed = [];
});

const dialog = (initial?: Record<string, unknown>) => (
  <MasterCreateDialog
    collection='models'
    open
    initial={initial}
    onOpenChange={vi.fn()}
    onCreated={vi.fn()}
  />
);

it('looks a model up on the web and fills the form for checking', async () => {
  // From a purchase line, the material starts at its name and part code.
  const view = render(
    dialog({ name: 'Dell OptiPlex 7010', code: 'OPT7010SFF' }),
  );
  expect(
    screen.getByRole('tab', { name: 'procurement.capture.aiTab' }),
  ).toHaveAttribute('aria-selected', 'true');
  // Nothing to save before the form is filled, and no footer at all: the
  // corner's close button closes it.
  expect(screen.queryByRole('button', { name: 'actions.save' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'actions.cancel' })).toBeNull();
  expect(
    screen.getByRole('textbox', { name: 'masterCapture.material' }),
  ).toHaveValue('Dell OptiPlex 7010 OPT7010SFF');
  expect(screen.getByText('masterCapture.willSearch')).toBeVisible();
  fireEvent.click(
    screen.getByRole('button', { name: 'procurement.capture.organise' }),
  );
  // Its own conversation, searching the web with a model that can, with
  // no tool of the register's.
  expect(state.asked).toHaveLength(1);
  expect(state.asked[0]!.message).toContain('ai.prompts.captureModel');
  expect(state.asked[0]!.message).toContain(
    '<material>\nDell OptiPlex 7010 OPT7010SFF\n</material>',
  );
  expect(state.asked[0]!.options).toEqual({
    skillSettings: { skills: ['catalog'], tools: [] },
    webSearch: true,
    model: { llmService: 'svc', model: 'searcher' },
  });

  const fill = state.tools.find((tool) => tool.name === 'fillModel');
  await act(async () => {
    await fill!.execute({ name: 'OptiPlex 7010 SFF' });
  });
  expect(state.requests[0]!.path).toBe('itam/master/models/capture/match');
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
          { type: 'text', text: 'No EOL date published; check the code.' },
        ],
      },
    ],
  };
  view.rerender(dialog({ name: 'Dell OptiPlex 7010', code: 'OPT7010SFF' }));
  expect(
    screen.getByText('No EOL date published; check the code.'),
  ).toBeVisible();
  expect(state.removed).toEqual(['c1']);

  expect(
    screen.getByRole('tab', { name: 'procurement.capture.formTab' }),
  ).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByLabelText('form-name')).toHaveValue('OptiPlex 7010 SFF');
  expect(screen.getByLabelText('form-warrantyMonths')).toHaveValue('36');
  // What it was not sure of, where it read it, a maker the books lack and
  // a model they already hold.
  // One beside the field, one in the hint above the form.
  expect(screen.getAllByText('procurement.capture.check')).toHaveLength(2);
  expect(screen.getByText('procurement.capture.reviewHint')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Dell spec sheet' })).toHaveAttribute(
    'href',
    'https://dell.example/7010',
  );
  expect(
    screen.getByText('masterCapture.manufacturerNotFound:Dell Technologies'),
  ).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'manufacturers.new' }),
  ).toBeVisible();
  expect(screen.getByRole('link', { name: 'OptiPlex 7010' })).toHaveAttribute(
    'href',
    '/main/models/m9',
  );

  // Changing the uncertain value is the check.
  fireEvent.change(screen.getByLabelText('form-code'), {
    target: { value: 'OPT7010-SFF' },
  });
  expect(screen.queryByText('procurement.capture.check')).toBeNull();

  // An adjustment is a new turn, with the same material.
  fireEvent.change(
    screen.getByRole('textbox', { name: 'procurement.capture.adjust' }),
    { target: { value: 'It is the tower version' } },
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'procurement.capture.adjust' }),
  );
  expect(state.asked).toHaveLength(2);
  expect(state.asked[1]!.message).toContain('ai.prompts.adjustMasterRecord');
  expect(state.asked[1]!.message).toContain('Dell OptiPlex 7010 OPT7010SFF');
});

it('says so when no configured model can search the web', () => {
  state.searchModel = false;
  render(dialog());
  expect(screen.getByText('masterCapture.cannotSearch')).toBeVisible();
  fireEvent.change(
    screen.getByRole('textbox', { name: 'masterCapture.material' }),
    { target: { value: 'Figma Professional' } },
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'procurement.capture.organise' }),
  );
  expect(state.asked[0]!.options).toEqual({
    skillSettings: { skills: ['catalog'], tools: [] },
  });
});

it('is the plain form without the assistant', () => {
  state.available = false;
  render(dialog());
  expect(screen.queryByRole('tab')).toBeNull();
  expect(screen.getByLabelText('form-name')).toBeVisible();
  expect(screen.getByRole('button', { name: 'actions.save' })).toBeVisible();
});

it('waits a moment before calling a turn that has not filled the form failed', async () => {
  vi.useFakeTimers();
  try {
    const view = render(dialog({ name: 'Testbook' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'procurement.capture.organise' }),
    );
    // The chat reloaded mid-turn: its last words are there, the call that
    // follows them not yet.
    const asked = state.asked[0]!.message;
    state.chat = {
      status: 'ready',
      conversationId: 'c2',
      messages: [
        { role: 'user', parts: [{ type: 'text', text: asked }] },
        {
          role: 'assistant',
          parts: [{ type: 'text', text: 'Handing the form back now.' }],
        },
      ],
    };
    view.rerender(dialog({ name: 'Testbook' }));
    expect(screen.queryByText('Handing the form back now.')).toBeNull();
    // The call arrives within the moment: the turn is a success.
    const fill = state.tools.find((tool) => tool.name === 'fillModel');
    await act(async () => {
      await fill!.execute({ name: 'Testbook' });
    });
    view.rerender(dialog({ name: 'Testbook' }));
    expect(
      screen.getByRole('tab', { name: 'procurement.capture.formTab' }),
    ).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Handing the form back now.')).toBeVisible();

    // A turn that never fills fails once the moment has passed.
    fireEvent.click(
      screen.getByRole('tab', { name: 'procurement.capture.aiTab' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'procurement.capture.organise' }),
    );
    const again = state.asked[1]!.message;
    state.chat = {
      status: 'ready',
      conversationId: 'c3',
      messages: [
        { role: 'user', parts: [{ type: 'text', text: again }] },
        {
          role: 'assistant',
          parts: [{ type: 'text', text: 'No such model.' }],
        },
      ],
    };
    view.rerender(dialog({ name: 'Testbook' }));
    expect(screen.queryByText('No such model.')).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(2600);
    });
    view.rerender(dialog({ name: 'Testbook' }));
    expect(screen.getByText('No such model.')).toBeVisible();
  } finally {
    vi.useRealTimers();
  }
});
