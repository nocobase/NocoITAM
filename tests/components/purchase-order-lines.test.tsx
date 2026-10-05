import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { PurchaseOrderLinesCard } from '../../client/pages/itam/procurement/lines-tab.js';

const state = vi.hoisted(() => ({
  status: 'draft',
  saved: [] as { lines: unknown[]; reason?: string }[],
  rows: undefined as unknown[] | undefined,
  // The frontend tools the card hands the assistant.
  tools: [] as {
    name: string;
    execute: (args: unknown) => unknown;
  }[],
}));
const lines = [
  {
    id: 'l1',
    itemType: 'device',
    modelId: 'm1',
    softwareProductId: null,
    quantity: 2,
    unitPrice: 9000,
    receivedQuantity: 1,
  },
  {
    id: 'l2',
    itemType: 'service',
    modelId: null,
    softwareProductId: null,
    quantity: 1,
    unitPrice: 500,
    receivedQuantity: 0,
  },
];
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      options?.count === undefined ? key : `${key}:${options.count}`,
  }),
}));
vi.mock('../../client/lib/itam/api.js', () => ({
  useApi: () => ({ request: vi.fn() }),
}));
vi.mock('../../client/lib/itam/permissions.js', () => ({
  useCollectionPermissions: () => ({ update: true, receive: true }),
  // Editing belongs to the side that raised the order; every record here
  // names this reader as its 负责人.
  useCurrentUserId: () => 'mia',
}));
vi.mock('../../client/lib/itam/references.js', () => ({
  useReferenceNames: () => ({ models: new Map([['m1', 'MacBook Pro 14']]) }),
}));
// The assistant is not configured here: the card registers as page context
// and hides its 解析单据 shortcut, as it does without a model.
vi.mock('../../client/lib/itam/ai-context.js', () => ({
  useAiPageContext: (descriptor: { tools?: typeof state.tools }) => {
    state.tools = descriptor.tools ?? [];
    return {
      ref: () => undefined,
      available: false,
      ask: () => undefined,
    };
  },
}));
// The reference pickers fetch their own options; the line's own behaviour is
// what this covers.
vi.mock('../../client/components/itam/reference-select.js', () => ({
  ReferenceSelect: ({
    value,
    onChange,
  }: {
    value: string | null;
    onChange: (value: string | null) => void;
  }) => (
    <button type='button' onClick={() => onChange('m1')}>
      {value ?? 'reference'}
    </button>
  ),
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: () => ({ data: state.rows ?? lines }),
  useMutation: () => ({
    mutate: (input: { lines: unknown[]; reason?: string }) =>
      state.saved.push(input),
    reset: vi.fn(),
    isPending: false,
    error: undefined,
  }),
}));

beforeEach(() => {
  state.status = 'draft';
  state.saved = [];
  state.rows = undefined;
});

it('reads as a document: every line, and what the order comes to', () => {
  render(
    <PurchaseOrderLinesCard
      record={{ id: 'po1', status: state.status, ownerId: 'mia' }}
    />,
  );
  const rows = screen.getAllByRole('row');
  expect(within(rows[1]!).getByText('MacBook Pro 14')).toBeVisible();
  expect(within(rows[1]!).getByText('1 / 2')).toBeVisible();
  // The totals row: how many units, what it costs, what came.
  const footer = rows.at(-1)!;
  expect(within(footer).getByText('3')).toBeVisible();
  expect(within(footer).getByText('18,500.00')).toBeVisible();
  expect(within(footer).getByText('1 / 3')).toBeVisible();
});

it('edits every line at once and saves them as one set', () => {
  render(
    <PurchaseOrderLinesCard
      record={{ id: 'po1', status: state.status, ownerId: 'mia' }}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'actions.edit' }));
  const editing = screen.getAllByRole('row')[1]!;
  // Quantity first, then the unit price.
  const [quantity] = within(editing).getAllByRole('spinbutton');
  fireEvent.change(quantity!, { target: { value: '4' } });
  // Editing drops the per-row subtotal column — the number inputs need the
  // width and the footer already totals the drafts, which follow the edit.
  expect(within(editing).queryByText('36,000.00')).toBeNull();
  expect(
    within(screen.getAllByRole('row').at(-1)!).getByText('36,500.00'),
  ).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));
  expect(state.saved).toHaveLength(1);
  expect(state.saved[0]?.reason).toBeUndefined();
  expect(state.saved[0]?.lines).toMatchObject([
    { id: 'l1', quantity: 4 },
    { id: 'l2', quantity: 1 },
  ]);
});

it('freezes the lines once the order has been approved', () => {
  // What was approved is what arrives: wrong lines mean cancelling the
  // order and asking again, not rewriting what the approver said yes to.
  state.status = 'ordered';
  render(
    <PurchaseOrderLinesCard
      record={{ id: 'po1', status: state.status, ownerId: 'mia' }}
    />,
  );
  expect(screen.queryByRole('button', { name: 'actions.edit' })).toBeNull();
});

it('refuses to remove a line that has receipts', () => {
  render(
    <PurchaseOrderLinesCard
      record={{ id: 'po1', status: state.status, ownerId: 'mia' }}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'actions.edit' }));
  const [first, second] = screen.getAllByRole('button', {
    name: 'actions.delete',
  });
  expect(first).toBeDisabled();
  fireEvent.click(second!);
  fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));
  expect(state.saved[0]?.lines).toMatchObject([{ id: 'l1' }]);
});

it('prices the first line of an order that has none yet', () => {
  // With no lines to read a price from, whether this reader sees money is
  // the order's own estimate. Reading "no prices" from an empty list left
  // the column out of the editor, so a new order could never be priced.
  state.rows = [];
  render(
    <PurchaseOrderLinesCard
      record={{
        id: 'po1',
        status: 'draft',
        estimatedTotal: 0,
        ownerId: 'mia',
      }}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'actions.edit' }));
  expect(screen.getByText('fields.unitPrice')).toBeVisible();
  expect(screen.getAllByRole('spinbutton')).toHaveLength(2);
});

it('leaves the price out for a reader the order shows no money to', () => {
  state.rows = [];
  render(
    <PurchaseOrderLinesCard
      record={{ id: 'po1', status: 'draft', ownerId: 'mia' }}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'actions.edit' }));
  expect(screen.queryByText('fields.unitPrice')).toBeNull();
  expect(screen.getAllByRole('spinbutton')).toHaveLength(1);
});

it('lets the assistant add lines to the draft under edit, not save them', async () => {
  render(
    <PurchaseOrderLinesCard
      record={{ id: 'po1', status: state.status, ownerId: 'mia' }}
    />,
  );
  const tool = state.tools.find((entry) => entry.name === 'addDraftLines');
  // Outside the editor there is no draft to add to.
  expect(() =>
    tool?.execute({ lines: [{ itemType: 'device', quantity: 1 }] }),
  ).toThrow();
  fireEvent.click(screen.getByRole('button', { name: 'actions.edit' }));
  const current = state.tools.find((entry) => entry.name === 'addDraftLines');
  await act(async () => {
    await current?.execute({
      lines: [
        { itemType: 'device', modelId: 'm1', quantity: 2, unitPrice: 900 },
      ],
    });
  });
  // Two existing lines, one added; nothing is written until 保存.
  expect(
    screen.getAllByRole('button', { name: 'actions.delete' }),
  ).toHaveLength(3);
  expect(state.saved).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));
  expect(state.saved[0]?.lines).toHaveLength(3);
  expect(state.saved[0]?.lines.at(-1)).toMatchObject({
    itemType: 'device',
    modelId: 'm1',
    quantity: 2,
    // The draft holds the price as the input shows it.
    unitPrice: '900',
  });
});
