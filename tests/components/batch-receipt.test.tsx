import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { BatchReceiptDialog } from '../../client/pages/itam/procurement/batch-receipt.js';

const state = vi.hoisted(() => ({
  requests: [] as { path: string; json?: unknown }[],
}));

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      options?.count === undefined ? key : `${key}:${options.count}`,
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
      return Promise.resolve({ data: {} });
    },
  }),
  // The line's model, so the devices are named after it; no stock of the
  // mice's model yet, so they start a new record.
  useItamList: (path: string) => ({
    data: {
      data:
        path === 'itam/master/models'
          ? [
              { id: 'm1', name: 'Test Book 14', code: 'TB14' },
              { id: 'm2', name: 'Test Mouse', code: 'TM' },
            ]
          : [],
    },
  }),
}));
vi.mock('../../client/lib/itam/permissions.js', () => ({
  useCurrentUserId: () => 'mia',
}));
vi.mock('../../client/lib/itam/references.js', () => ({
  useReferenceNames: () => ({}),
}));
// No model configured: the form is the batch form alone, with no document
// strip — receiving in batch never depends on the assistant.
vi.mock('../../client/lib/itam/ai-chat.js', () => ({
  useItamAi: () => undefined,
  useHiddenChat: () => ({ status: 'ready', messages: [] }),
}));
vi.mock('../../client/extensions/nocobase-ai/index.js', () => ({
  useAI: () => ({}),
  useAIPageElementHandle: () => ({ ref: () => undefined, context: {} }),
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
  useQuery: () => ({ data: [], isFetching: false }),
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
});

it('turns a pasted column of serials into one device each and receives every line at once', () => {
  render(
    <BatchReceiptDialog
      orderId='po1'
      order={{ id: 'po1', orderNo: 'PO-1', departmentId: 'dept1' }}
      lines={lines}
      onClose={vi.fn()}
    />,
  );
  // Entitlements keep their own dialog.
  expect(screen.getByText('receipt.entitlementsSeparately')).toBeVisible();
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
  fireEvent.change(screen.getByLabelText('receipt.quantityThisTime'), {
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
    <BatchReceiptDialog
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
