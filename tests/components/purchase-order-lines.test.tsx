import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { PurchaseOrderLinesCard } from '../../client/pages/itam/procurement/lines-tab.js';

const state = vi.hoisted(() => ({
  status: 'draft',
  saved: [] as { lines: unknown[]; reason?: string }[],
  rows: undefined as unknown[] | undefined,
  aiAvailable: false,
  // What 解析单据 was given, and the hook's callbacks to play its reading.
  organised: [] as string[],
  capture: {} as {
    onFill?: (capture: unknown) => void;
    form?: () => {
      lines: unknown[];
      existingLines?: unknown[];
    };
  },
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
  listQueryParams: (query: unknown) => query,
  useApi: () => ({ request: vi.fn() }),
}));
// 解析单据 is AI 整理's reading (tested on its own); here, what the card
// does with what it hands back.
vi.mock('../../client/lib/itam/use-purchase-capture.js', () => ({
  usePurchaseOrderCapture: (options: typeof state.capture) => {
    state.capture = options;
    return {
      available: state.aiAvailable,
      busy: false,
      mode: undefined,
      phase: undefined,
      failure: undefined,
      turns: [],
      summary: 'Read the quote.',
      fileId: undefined,
      organise: (_pasted: string, file: File) =>
        state.organised.push(file.name),
      adjust: vi.fn(),
      release: vi.fn(),
      place: vi.fn(),
    };
  },
}));
vi.mock('../../client/lib/itam/permissions.js', () => ({
  useCollectionPermissions: () => ({ update: true, receive: true }),
  // Editing belongs to the side that raised the order; every record here
  // names this reader as its 负责人.
  useCurrentUserId: () => 'mia',
}));
vi.mock('../../client/lib/itam/references.js', () => ({
  referencePath: (collection: string) => `itam/master/${collection}`,
  useReferenceNames: () => ({ models: new Map([['m1', 'MacBook Pro 14']]) }),
}));
// The assistant is not configured unless a test says so: the order is the
// chat's page context, and the card hides its 解析单据 shortcut, as it does
// without a model.
vi.mock('../../client/lib/itam/ai-chat.js', () => ({
  useAiPageContext: () => ({
    available: state.aiAvailable,
    ask: () => undefined,
  }),
}));
// The reference pickers fetch their own options; the line's own behaviour is
// what this covers.
// Creating a model from a line's picker is the master data's own form.
// 报价比较 has tests of its own (quote-comparison.test.tsx).
vi.mock('../../client/pages/itam/procurement/quote-comparison.js', () => ({
  QuoteComparisonEntry: () => null,
}));
vi.mock('../../client/components/itam/quick-create-dialog.js', () => ({
  QuickCreateDialog: () => null,
}));
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
  state.aiAvailable = false;
  state.organised = [];
  state.capture = {};
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

const reading = (lines: number) => ({
  values: {},
  vendorName: null,
  departmentName: null,
  uncertain: [],
  lines: Array.from({ length: lines }, () => ({
    itemType: 'device',
    modelId: 'm1',
    softwareProductId: null,
    quantity: 2,
    unitPrice: 900,
    uncertain: true,
    description: 'MacBook Pro 14',
  })),
  unmatched: [
    {
      description: 'Dell WD25TB4',
      partCode: null,
      quantity: 5,
      unitPrice: 1899,
      source: null,
      itemType: null,
    },
  ],
});

it('reads a document into the lines the way AI 整理 does, without pressing 编辑 first', () => {
  state.aiAvailable = true;
  render(
    <PurchaseOrderLinesCard
      record={{ id: 'po1', status: state.status, ownerId: 'mia' }}
    />,
  );
  // Offered beside 编辑, not only inside the editor.
  expect(
    screen.getByRole('button', { name: 'ai.parseDocument' }),
  ).toBeVisible();
  expect(screen.queryByRole('button', { name: 'actions.save' })).toBeNull();
  const input = document.querySelector<HTMLInputElement>('input[type=file]')!;
  fireEvent.change(input, {
    target: { files: [new File(['quote'], 'quote.pdf')] },
  });
  // Choosing the file opened the editor and started the reading.
  expect(state.organised).toEqual(['quote.pdf']);
  expect(screen.getByRole('button', { name: 'actions.save' })).toBeVisible();

  act(() => state.capture.onFill?.(reading(1)));
  // Added to the two lines the order had, marked where it was unsure, and
  // the line it could not place listed to pick or create.
  expect(
    screen.getAllByRole('button', { name: 'actions.delete' }),
  ).toHaveLength(3);
  expect(screen.getAllByText('procurement.capture.check')).toHaveLength(1);
  expect(screen.getByText('procurement.capture.unmatched:1')).toBeVisible();
  expect(screen.getByText(/Dell WD25TB4 × 5/)).toBeVisible();
  // The assistant reads its own lines apart from the order's.
  expect(state.capture.form?.().lines).toHaveLength(1);
  expect(state.capture.form?.().existingLines).toHaveLength(2);

  // An adjustment hands its lines back whole: they replace the ones it
  // added, not the order's own.
  act(() => state.capture.onFill?.(reading(2)));
  expect(
    screen.getAllByRole('button', { name: 'actions.delete' }),
  ).toHaveLength(4);

  fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));
  expect(state.saved[0]?.lines).toHaveLength(4);
});
