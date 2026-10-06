import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { PurchaseOrderCreateDialog } from '../../client/pages/itam/procurement/create-dialog.js';

const state = vi.hoisted(() => ({
  available: true,
  asked: [] as { message: string; options: unknown }[],
  requests: [] as { path: string; json?: unknown }[],
  chat: { status: 'ready', messages: [] } as Record<string, unknown>,
  removed: [] as string[],
  tools: [] as {
    name: string;
    execute: (args: unknown) => Promise<unknown>;
  }[],
}));

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number; name?: string }) =>
      options?.count !== undefined
        ? `${key}:${options.count}`
        : options?.name !== undefined
          ? `${key}:${options.name}`
          : key,
  }),
}));
vi.mock('@nocobase/app-client', () => ({ useService: () => ({}) }));
vi.mock('@nocobase/app-plugin-file/client', () => ({
  clientFileRepositoryManagerToken: Symbol('files'),
}));
vi.mock('../../client/lib/itam/api.js', () => ({
  useApi: () => ({
    request: (input: { path: string; json?: unknown }) => {
      state.requests.push(input);
      return Promise.resolve({
        data: input.path.endsWith('capture/match')
          ? {
              values: {
                reason: 'newHire',
                description: 'Three laptops for the lab',
                vendorId: 'v1',
              },
              lines: [
                {
                  itemType: 'device',
                  modelId: 'm1',
                  softwareProductId: null,
                  quantity: 3,
                  unitPrice: 1999,
                  uncertain: true,
                  description: 'Testbook',
                },
              ],
              unmatched: [
                {
                  description: 'Testbook Pro 14 (T4)',
                  partCode: null,
                  quantity: 10,
                  unitPrice: null,
                  source: null,
                },
              ],
              vendorName: null,
              departmentName: 'Moon Base',
              uncertain: ['vendorId'],
            }
          : {},
      });
    },
  }),
  useItamList: () => ({ data: { data: [] } }),
  useItamSettings: () => ({ data: { general: { currency: 'CNY' } } }),
}));
vi.mock('../../client/lib/itam/references.js', () => ({
  useReferenceNames: () => ({}),
}));
vi.mock('../../client/lib/itam/ai-chat.js', () => ({
  useItamAi: () =>
    state.available
      ? {
          available: true,
          capture: {
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
  useAI: () => ({}),
  useAIPageElementHandle: (descriptor: { tools?: typeof state.tools }) => {
    state.tools = descriptor.tools ?? [];
    return { ref: () => undefined, context: {} };
  },
}));
vi.mock('../../client/components/itam/reference-select.js', () => ({
  // A picker that picks: the unmatched rows' pickers are found by their
  // placeholder, and choosing hands back a model of the books.
  ReferenceSelect: ({
    id,
    value,
    placeholder,
    initialSearch,
    onChange,
    onCreate,
  }: {
    id?: string;
    value: string | null;
    placeholder?: string;
    initialSearch?: string;
    onChange: (value: string | null) => void;
    onCreate?: (search: string) => void;
  }) => (
    <span data-testid={id}>
      <button
        type='button'
        data-search={initialSearch}
        onClick={() => onChange('m2')}
      >
        {value ?? placeholder ?? 'reference'}
      </button>
      {onCreate ? <span>create offered</span> : null}
    </span>
  ),
}));
// Creating a model is the master data's own form, tested on its page.
vi.mock('../../client/components/itam/quick-create-dialog.js', () => ({
  QuickCreateDialog: () => null,
}));
vi.mock('../../client/lib/itam/permissions.js', () => ({
  useCollectionPermissions: () => ({ create: true }),
  useCurrentUserId: () => 'mia',
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    error: undefined,
  }),
}));

beforeEach(() => {
  state.available = true;
  state.asked = [];
  state.requests = [];
  state.tools = [];
  state.chat = { status: 'ready', messages: [] };
  state.removed = [];
});

const dialog = () => (
  <PurchaseOrderCreateDialog open onOpenChange={vi.fn()} onCreated={vi.fn()} />
);

it('opens on AI 整理 and fills the form from what the assistant read', async () => {
  const view = render(dialog());
  expect(
    screen.getByRole('tab', { name: 'procurement.capture.aiTab' }),
  ).toHaveAttribute('aria-selected', 'true');
  // Nothing to save before the form is filled, and no footer at all: the
  // corner's close button closes it.
  expect(screen.queryByRole('button', { name: 'actions.cancel' })).toBeNull();
  expect(
    screen.queryByRole('button', { name: 'procurement.saveDraft' }),
  ).toBeNull();
  expect(
    screen.queryByRole('button', { name: 'procurement.submit' }),
  ).toBeNull();
  fireEvent.change(
    screen.getByRole('textbox', { name: 'procurement.capture.material' }),
    { target: { value: 'Three Testbooks for the lab from Northwind' } },
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'procurement.capture.organise' }),
  );
  // The material goes to the assistant's own conversation, which may only
  // look models up besides filling the form.
  expect(state.asked).toHaveLength(1);
  expect(state.asked[0]!.message).toContain('ai.prompts.capturePurchaseOrder');
  expect(state.asked[0]!.message).toContain(
    '<pasted_text>\nThree Testbooks for the lab from Northwind\n</pasted_text>',
  );
  expect(state.asked[0]!.options).toMatchObject({
    skillSettings: { skills: [], tools: ['itam_match_model'] },
  });

  const fill = state.tools.find((tool) => tool.name === 'fillPurchaseOrder');
  await act(async () => {
    await fill!.execute({
      reason: 'newHire',
      vendorName: 'Northwind',
      surprise: 'dropped',
      lines: [{ description: 'Testbook', quantity: 3 }],
    });
  });
  // Only what the endpoint's strict schema knows is sent.
  const sent = state.requests.find((request) =>
    request.path.endsWith('capture/match'),
  );
  expect(sent?.json).not.toHaveProperty('surprise');
  // The turn ends with the assistant's sentence, and its conversation goes.
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
        parts: [{ type: 'text', text: 'Filled one line; check the vendor.' }],
      },
    ],
  };
  view.rerender(dialog());
  expect(screen.getByText('Filled one line; check the vendor.')).toBeVisible();
  expect(state.removed).toEqual(['c1']);

  expect(
    screen.getByRole('tab', { name: 'procurement.capture.formTab' }),
  ).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByDisplayValue('Three laptops for the lab')).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'procurement.saveDraft' }),
  ).toBeVisible();
  // The vendor and the line the assistant was not sure of.
  expect(screen.getAllByText('procurement.capture.check')).toHaveLength(2);
  expect(screen.getByText('procurement.capture.unmatched:1')).toBeVisible();
  expect(screen.getByText(/Testbook Pro 14 \(T4\) × 10/)).toBeVisible();
  expect(
    screen.getByText('procurement.capture.departmentNotFound:Moon Base'),
  ).toBeVisible();

  // The row the books did not hold is placed from its own picker, which
  // starts at the document's wording and offers to create the model.
  expect(screen.getByText(/procurement\.linesTotal:1\b/)).toBeVisible();
  const picker = screen
    .getAllByRole('button', { name: 'procurement.selectModel' })
    .find((button) => button.dataset.search === 'Testbook Pro 14 (T4)');
  expect(picker).toBeDefined();
  await act(async () => {
    fireEvent.click(picker!);
    await Promise.resolve();
  });
  const placed = state.requests.filter((request) =>
    request.path.endsWith('capture/match'),
  );
  expect(placed.at(-1)?.json).toMatchObject({
    lines: [
      { modelId: 'm2', description: 'Testbook Pro 14 (T4)', quantity: 10 },
    ],
  });
  expect(screen.getByText(/procurement\.linesTotal:2\b/)).toBeVisible();
  expect(screen.queryByText('procurement.capture.unmatched:1')).toBeNull();

  // 调整 asks again with the request, the material still attached.
  fireEvent.change(
    screen.getByRole('textbox', { name: 'procurement.capture.adjust' }),
    { target: { value: 'make it 5' } },
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'procurement.capture.adjust' }),
  );
  expect(state.asked).toHaveLength(2);
  expect(state.asked[1]!.message).toContain('ai.prompts.adjustPurchaseOrder');
  expect(state.asked[1]!.message).toContain('<pasted_text>');
});

it('is the plain form when the assistant is not available', () => {
  state.available = false;
  render(dialog());
  expect(screen.queryByRole('tab')).toBeNull();
  expect(
    screen.queryByRole('textbox', { name: 'procurement.capture.material' }),
  ).toBeNull();
  expect(screen.getByText('fields.poReason')).toBeVisible();
  // 供应商 and 币种, then 说明 across the full width above the lines, and
  // 审批人 at the bottom.
  const labels = [...document.querySelectorAll('label')].map(
    (label) => label.textContent ?? '',
  );
  const at = (key: string) =>
    labels.findIndex((label) => label.startsWith(key));
  expect(at('fields.vendor')).toBeGreaterThan(-1);
  expect(at('fields.currency')).toBe(at('fields.vendor') + 1);
  expect(at('fields.description')).toBe(at('fields.currency') + 1);
  expect(at('procurement.approver')).toBe(labels.length - 1);
  // Rows add rows; the header button is only for an empty list.
  expect(
    screen.queryByRole('button', { name: 'procurement.addLine' }),
  ).toBeNull();
});
