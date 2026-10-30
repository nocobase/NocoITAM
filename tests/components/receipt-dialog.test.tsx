import {
  fireEvent,
  render as renderInPage,
  screen,
} from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';

import { ReceiptDialog } from '../../client/pages/itam/procurement/receipt-dialog.js';

// A line's model is a link (2026-10-30), which needs a router.
const render = (ui: ReactElement) =>
  renderInPage(ui, { wrapper: MemoryRouter });

const state = vi.hoisted(() => ({
  requests: [] as { path: string; json?: unknown }[],
  // The accounts that may answer for records; the reader is `mia`.
  owners: ['mia'] as string[],
  // Stock already on the books, and what the live check finds.
  stock: [] as Record<string, unknown>[],
  issues: [] as Record<string, unknown>[],
}));

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    i18n: { language: 'en-US' },
    t: (key: string, options?: { count?: number }) =>
      options?.count === undefined ? key : `${key}:${options.count}`,
  }),
}));
vi.mock('@nocobase/app-client', () => ({
  useService: () => ({}),
  // Unique enough for the row keys and message ids these tests create.
  createUuid: () => Math.random().toString(36).slice(2),
}));
vi.mock('@nocobase/app-plugin-file/client', () => ({
  clientFileRepositoryManagerToken: Symbol('files'),
}));
vi.mock('../../client/lib/itam/api.js', () => ({
  useApi: () => ({
    request: (input: { path: string; json?: unknown }) => {
      state.requests.push(input);
      return Promise.resolve({ data: {} });
    },
  }),
  useItamRecord: () => ({ data: undefined }),
  useItamSettings: () => ({ data: { general: { currency: 'CNY' } } }),
  // The line's model, so the devices are named after it; no stock of the
  // mice's model yet, so they start a new record, and no entitlement of the
  // product, so seats open a new one.
  useItamList: (path: string) => ({
    data: {
      data:
        path === 'itam/users'
          ? state.owners.map((id) => ({ id }))
          : path === 'itam/master/models'
            ? [
                { id: 'm1', name: 'Test Book 14', code: 'TB14' },
                { id: 'm2', name: 'Test Mouse', code: 'TM' },
              ]
            : path === 'itam/stock'
              ? state.stock
              : [],
    },
  }),
}));
vi.mock('../../client/lib/itam/permissions.js', () => ({
  useCurrentUserId: () => 'mia',
}));
vi.mock('../../client/lib/itam/references.js', () => ({
  referencePath: (collection: string) => `itam/master/${collection}`,
  referenceRoute: (collection: string) => collection,
  useReferenceNames: () => ({}),
}));
// No model configured: the form is the batch form alone, with no document
// strip — receiving in batch never depends on the assistant.
vi.mock('../../client/lib/itam/ai-chat.js', () => ({
  useItamAi: () => ({ available: false }),
  useAiReading: () => () => Promise.reject(new Error('not available')),
}));
vi.mock('../../client/components/itam/reference-select.js', () => ({
  ReferenceSelect: ({
    id,
    value,
    onChange,
  }: {
    id: string;
    value: string | null;
    onChange: (value: string | null) => void;
  }) => (
    <button type='button' data-testid={id} onClick={() => onChange('loc1')}>
      {value ?? 'reference'}
    </button>
  ),
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  // The rules find nothing wrong with the batch.
  useQuery: () => ({ data: state.issues, isFetching: false }),
  useMutation: (options: { mutationFn: () => unknown }) => ({
    mutate: () => options.mutationFn(),
    isPending: false,
    error: undefined,
  }),
}));

const lines = [
  {
    id: 'l1',
    itemType: 'device',
    modelId: 'm1',
    quantity: 3,
    receivedQuantity: 0,
  },
  {
    id: 'l2',
    itemType: 'accessory',
    modelId: 'm2',
    quantity: 5,
    receivedQuantity: 1,
  },
  {
    id: 'l3',
    itemType: 'subscription',
    softwareProductId: 'p1',
    quantity: 5,
    receivedQuantity: 0,
  },
];

beforeEach(() => {
  state.requests = [];
  state.owners = ['mia'];
  state.stock = [];
  state.issues = [];
});

it('turns a pasted column of serials into one device each and receives every line at once', () => {
  render(
    <ReceiptDialog
      orderId='po1'
      order={{ id: 'po1', orderNo: 'PO-1', departmentId: 'dept1' }}
      lines={lines}
      onClose={vi.fn()}
    />,
  );
  expect(screen.queryByText('Test Book 14')).toBeVisible();

  fireEvent.click(screen.getByRole('button', { name: 'receipt.addUnit' }));
  const first = screen.getByRole('textbox', { name: 'receipt.serialOf' });
  fireEvent.paste(first, {
    clipboardData: { getData: () => 'S1\nS2\r\nS3\n' },
  });
  const serials = screen.getAllByRole('textbox', { name: 'receipt.serialOf' });
  expect(serials.map((input) => (input as HTMLInputElement).value)).toEqual([
    'S1',
    'S2',
    'S3',
  ]);
  // The place every unit of the line goes, and where the new stock record
  // of mice is kept.
  fireEvent.click(screen.getByTestId('batch-location-l1'));
  fireEvent.change(screen.getAllByLabelText('receipt.quantityThisTime')[0]!, {
    target: { value: '4' },
  });
  fireEvent.click(screen.getByTestId('batch-stock-location-l2'));

  fireEvent.click(screen.getByRole('button', { name: 'receipt.confirm:7' }));
  const receipt = state.requests.find((request) =>
    request.path.endsWith('/receive-batch'),
  );
  expect(receipt?.json).toEqual({
    runId: null,
    receipts: [
      {
        lineId: 'l1',
        quantity: 3,
        serialNos: ['S1', 'S2', 'S3'],
        locationId: 'loc1',
        extra: {
          name: 'Test Book 14',
          departmentId: 'dept1',
          warrantyEndDate: null,
          ownerId: 'mia',
        },
      },
      {
        lineId: 'l2',
        quantity: 4,
        stockItemId: null,
        locationId: 'loc1',
        extra: { name: 'Test Mouse', ownerId: 'mia' },
      },
    ],
  });
});

it('offers nothing to receive until a line has something in it', () => {
  render(
    <ReceiptDialog
      orderId='po1'
      order={{ id: 'po1' }}
      lines={lines}
      onClose={vi.fn()}
    />,
  );
  expect(
    screen.getByRole('button', { name: 'receipt.confirm:0' }),
  ).toBeDisabled();
});

it('takes a scanner’s Enter or Tab as the end of a code, and does not receive the row left waiting', () => {
  render(
    <ReceiptDialog
      orderId='po1'
      order={{ id: 'po1' }}
      lines={lines}
      onClose={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'receipt.addUnit' }));
  const scan = (code: string, key: 'Enter' | 'Tab') => {
    const inputs = screen.getAllByRole('textbox', { name: 'receipt.serialOf' });
    const input = inputs.at(-1)!;
    fireEvent.change(input, { target: { value: code } });
    fireEvent.keyDown(input, { key });
  };
  scan('S1', 'Enter');
  scan('S2', 'Tab');
  // A row waits for a third scan that never comes.
  expect(
    screen
      .getAllByRole('textbox', { name: 'receipt.serialOf' })
      .map((input) => (input as HTMLInputElement).value),
  ).toEqual(['S1', 'S2', '']);
  fireEvent.click(screen.getByTestId('batch-location-l1'));
  fireEvent.click(screen.getByRole('button', { name: 'receipt.confirm:2' }));
  const receipt = state.requests.find((request) =>
    request.path.endsWith('/receive-batch'),
  );
  expect(
    (receipt?.json as { receipts: { serialNos?: string[] }[] }).receipts[0]
      ?.serialNos,
  ).toEqual(['S1', 'S2']);
});

it('receives seats in the same form, and a new subscription waits for its renewal date', () => {
  render(
    <ReceiptDialog
      orderId='po1'
      order={{ id: 'po1' }}
      lines={lines}
      onClose={vi.fn()}
    />,
  );
  // No entitlement of the product is on the books: a new one is the only
  // answer, and joining is not offered.
  expect(
    screen.getByRole('radio', { name: 'procurement.joinEntitlement' }),
  ).toHaveAttribute('aria-disabled', 'true');
  fireEvent.change(screen.getAllByLabelText('receipt.quantityThisTime')[1]!, {
    target: { value: '5' },
  });
  expect(
    screen.getByRole('button', { name: 'receipt.confirm:5' }),
  ).toBeDisabled();
});

it('names the order’s 负责人 when the receiver may not answer for records', () => {
  // Receiving as the platform administrator, who is nobody's 负责人.
  state.owners = ['wujing'];
  render(
    <ReceiptDialog
      orderId='po1'
      order={{ id: 'po1', ownerId: 'wujing' }}
      lines={lines}
      onClose={vi.fn()}
    />,
  );
  expect(screen.getByTestId('batch-owner-l1')).toHaveTextContent('wujing');
});

it('heads each line with its type, its name and how much of it came', () => {
  render(
    <ReceiptDialog
      orderId='po1'
      order={{ id: 'po1' }}
      lines={lines}
      onClose={vi.fn()}
    />,
  );
  expect(screen.getByRole('link', { name: 'Test Mouse' })).toBeVisible();
  expect(screen.getByText('enums.appliesTo.accessory')).toBeVisible();
  expect(screen.getAllByText(/receipt\.counts/)).toHaveLength(3);
});

it('adds stock to any record of the model, or starts a new one with its required fields', () => {
  state.stock = [
    {
      id: 'st1',
      kind: 'accessory',
      modelId: 'm2',
      name: 'Mice',
      locationId: 'a',
    },
  ];
  render(
    <ReceiptDialog
      orderId='po1'
      order={{ id: 'po1' }}
      lines={lines}
      onClose={vi.fn()}
    />,
  );
  fireEvent.change(screen.getAllByLabelText('receipt.quantityThisTime')[0]!, {
    target: { value: '2' },
  });
  // The model's first record by default, and any other of its records.
  expect(screen.getByTestId('batch-stock-item-l2')).toHaveTextContent('st1');
  fireEvent.click(screen.getByTestId('batch-stock-item-l2'));
  fireEvent.click(screen.getByRole('button', { name: 'receipt.confirm:2' }));
  const joined = state.requests.find((request) =>
    request.path.endsWith('/receive-batch'),
  );
  expect(joined?.json).toMatchObject({
    receipts: [{ lineId: 'l2', quantity: 2, stockItemId: 'loc1' }],
  });

  // A new record beside it asks its name, place and 负责人.
  state.requests = [];
  fireEvent.click(
    screen.getByRole('radio', { name: 'procurement.newStockItem' }),
  );
  expect(document.getElementById('batch-stock-name-l2')).toHaveValue(
    'Test Mouse',
  );
  expect(screen.getByTestId('batch-stock-owner-l2')).toHaveTextContent('mia');
  expect(
    screen.getByRole('button', { name: 'receipt.confirm:2' }),
  ).toBeDisabled();
  fireEvent.click(screen.getByTestId('batch-stock-location-l2'));
  fireEvent.click(screen.getByRole('button', { name: 'receipt.confirm:2' }));
  const created = state.requests.find((request) =>
    request.path.endsWith('/receive-batch'),
  );
  expect(created?.json).toMatchObject({
    receipts: [
      {
        lineId: 'l2',
        stockItemId: null,
        locationId: 'loc1',
        extra: { name: 'Test Mouse', ownerId: 'mia' },
      },
    ],
  });
});

it('says a serial number is missing only once a row is left empty', () => {
  state.issues = [{ code: 'serialRequired', lineId: 'l1', blocking: true }];
  render(
    <ReceiptDialog
      orderId='po1'
      order={{ id: 'po1' }}
      lines={lines}
      onClose={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'receipt.addUnit' }));
  expect(screen.queryByText('receipt.issues.serialRequired')).toBeNull();
  const serial = screen.getByRole('textbox', { name: 'receipt.serialOf' });
  fireEvent.blur(serial);
  expect(screen.getByText('receipt.issues.serialRequired')).toBeVisible();
  expect(serial).toHaveAttribute('aria-invalid', 'true');
});
