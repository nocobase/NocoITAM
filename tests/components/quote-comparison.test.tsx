import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { QuoteComparisonEntry } from '../../client/pages/itam/procurement/quote-comparison.js';

const state = vi.hoisted(() => ({
  saved: null as unknown,
  asked: [] as { task: string; material: string; context: unknown }[],
  stored: [] as Record<string, unknown>[],
  requests: [] as { path: string; method?: string; json?: unknown }[],
}));

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options && 'vendor' in options ? `${key}:${String(options.vendor)}` : key,
  }),
}));
vi.mock('@nocobase/app-client', () => ({
  useService: () => ({ repository: () => ({ uploadOne: vi.fn() }) }),
}));
vi.mock('@nocobase/app-plugin-file/client', () => ({
  clientFileRepositoryManagerToken: 'files',
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('../../client/lib/itam/api.js', () => ({
  listQueryParams: (query: unknown) => query,
  masterDataPath: (collection: string) => `itam/master/${collection}`,
  useApi: () => ({
    request: (input: { path: string; method?: string; json?: unknown }) => {
      state.requests.push(input);
      if (input.path === 'itam/master/vendors')
        return Promise.resolve({
          data: [{ id: 'v-b', name: 'Supplier B' }],
        });
      return Promise.resolve({ data: {} });
    },
  }),
}));
vi.mock('../../client/lib/itam/references.js', () => ({
  useReferenceNames: () => ({ models: new Map([['m1', 'ThinkPad X1']]) }),
}));
vi.mock('../../client/components/itam/reference-select.js', () => ({
  ReferenceSelect: () => null,
}));
vi.mock('../../client/lib/itam/ai-chat.js', () => ({
  useItamAi: () => ({ available: true }),
  useAiReading:
    () =>
    (input: (typeof state.asked)[number]): Promise<unknown> => {
      state.asked.push(input);
      if (input.task === 'quoteRecommendation')
        return Promise.resolve({
          reading: { quoteIndex: 1, reasons: ['B is 300 cheaper'] },
          said: '',
        });
      const vendor = state.asked.length === 1 ? 'Supplier A' : 'Supplier B';
      return Promise.resolve({
        reading: {
          vendorName: vendor,
          deliveryDays: 5,
          lines: [
            {
              lineId: 'l1',
              unitPrice: vendor === 'Supplier A' ? 9500 : 9350,
            },
          ],
        },
        said: '',
      });
    },
}));
// The server keeps the quotes and counts the table; here, a table of the
// quotes as they were saved.
vi.mock('../../client/lib/itam/quote-comparison.js', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../client/lib/itam/quote-comparison.js')
    >();
  const viewOf = (input: {
    quotes: { vendorName: string; lines: { unitPrice?: number | null }[] }[];
    recommendation?: unknown;
    chosenIndex?: number | null;
  }) => ({
    purchaseOrderId: 'po1',
    quotes: input.quotes,
    recommendation: input.recommendation ?? null,
    chosenIndex: input.chosenIndex ?? null,
    rows: [
      {
        lineId: 'l1',
        itemType: 'device',
        modelId: 'm1',
        softwareProductId: null,
        quantity: 2,
        lastPrice: null,
        cells: input.quotes.map((quote) => ({
          unitPrice: quote.lines[0]?.unitPrice ?? null,
          quantity: null,
          amount: null,
        })),
        lowest: input.quotes.length > 1 ? 1 : null,
      },
    ],
    totals: input.quotes.map(() => ({
      amount: null,
      covered: 1,
      missing: 0,
      extras: 0,
    })),
    prices: true,
    updatedAt: '',
  });
  let current: unknown = null;
  return {
    ...actual,
    useQuoteComparison: () => ({ data: state.saved }),
    useSaveQuoteComparison: () => ({
      get data() {
        return current;
      },
      mutateAsync: (input: Parameters<typeof viewOf>[0]) => {
        state.stored.push(input as Record<string, unknown>);
        current = viewOf(input);
        return Promise.resolve(current);
      },
    }),
  };
});

beforeEach(() => {
  state.saved = null;
  state.asked = [];
  state.stored = [];
  state.requests = [];
});

const record = {
  id: 'po1',
  status: 'draft',
  reason: 'newHire',
  description: 'Two laptops',
};
const lines = [
  { id: 'l1', itemType: 'device', modelId: 'm1', quantity: 2, unitPrice: null },
];

const paste = async (content: string) => {
  fireEvent.click(screen.getByRole('button', { name: 'quotes.paste' }));
  fireEvent.change(screen.getByPlaceholderText('quotes.pastePlaceholder'), {
    target: { value: content },
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'quotes.read' }));
  });
};

it('reads pasted quotes against the lines, then asks which to take', async () => {
  render(<QuoteComparisonEntry record={record} lines={lines} canEdit />);
  fireEvent.click(screen.getByRole('button', { name: 'quotes.compare' }));
  await paste('Supplier A quote: X1 9500');
  expect(state.asked[0]).toMatchObject({
    task: 'purchaseQuote',
    material: 'Supplier A quote: X1 9500',
    context: {
      lines: [{ id: 'l1', item: 'ThinkPad X1', quantity: 2 }],
    },
  });
  // One quote: nothing to recommend yet.
  expect(state.asked).toHaveLength(1);
  await paste('Supplier B quote: X1 9350');
  expect(state.asked.map((entry) => entry.task)).toEqual([
    'purchaseQuote',
    'purchaseQuote',
    'quoteRecommendation',
  ]);
  expect(state.stored.at(-1)).toMatchObject({
    recommendation: { quoteIndex: 1, reasons: ['B is 300 cheaper'] },
  });
  expect(screen.getByText('quotes.recommended:Supplier B')).toBeInTheDocument();
});

it('takes a quote: the vendor by its name, and the lines’ unit prices', async () => {
  render(<QuoteComparisonEntry record={record} lines={lines} canEdit />);
  fireEvent.click(screen.getByRole('button', { name: 'quotes.compare' }));
  await paste('Supplier A quote');
  await paste('Supplier B quote');
  await act(async () => {
    fireEvent.click(screen.getAllByRole('button', { name: 'quotes.take' })[1]!);
  });
  expect(state.requests).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        path: 'itam/purchase-orders/po1',
        method: 'PATCH',
        json: { vendorId: 'v-b' },
      }),
      expect.objectContaining({
        path: 'itam/purchase-orders/po1/lines',
        method: 'PUT',
        json: {
          lines: [expect.objectContaining({ id: 'l1', unitPrice: 9350 })],
        },
      }),
    ]),
  );
  expect(state.stored.at(-1)).toMatchObject({ chosenIndex: 1 });
});

it('shows a saved comparison to anyone, and offers nothing on an order with no lines', () => {
  const { rerender } = render(
    <QuoteComparisonEntry record={record} lines={[]} canEdit />,
  );
  expect(
    screen.queryByRole('button', { name: 'quotes.compare' }),
  ).not.toBeInTheDocument();
  state.saved = {
    quotes: [{ vendorName: 'Supplier B', lines: [] }],
    chosenIndex: 0,
  };
  rerender(
    <QuoteComparisonEntry record={record} lines={lines} canEdit={false} />,
  );
  expect(screen.getByText(/quotes.compared/)).toBeInTheDocument();
});
