import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';

import { PersonBelongings } from '../../client/components/itam/person-belongings.js';
import { TooltipProvider } from '../../client/components/ui/tooltip.js';

interface Request {
  readonly path: string;
  readonly method?: string;
  readonly json?: unknown;
}

const state = vi.hoisted(() => ({
  requests: [] as Request[],
  /** A request whose path contains this fails, the way a refusal would. */
  failOn: undefined as string | undefined,
  recovery: undefined as unknown,
  /** What the plan reads after the act, for the toast. */
  after: undefined as unknown,
  toasts: [] as { title?: unknown; description?: unknown }[],
  /** Holds the toast's reread of the plan until the test lets it go. */
  gate: undefined as Promise<void> | undefined,
}));
vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<object>()),
  useToaster: () => ({
    show: (toast: { title?: unknown; description?: unknown }) => {
      state.toasts.push(toast);
      return 'toast';
    },
    close: () => undefined,
  }),
}));

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('../../client/lib/itam/api.js', async (original) => ({
  ...(await original<object>()),
  useApi: () => ({
    request: async (request: Request) => {
      state.requests.push(request);
      if (state.failOn && request.path.includes(state.failOn))
        throw new Error('Not allowed');
      return {};
    },
  }),
}));
vi.mock('../../client/lib/itam/permissions.js', () => ({
  useCollectionPermissions: () => ({
    return: true,
    issue: true,
    assignSeat: true,
  }),
  useCurrentUserId: () => 'mia',
}));
vi.mock('../../client/lib/itam/references.js', async (original) => ({
  ...(await original<object>()),
  useReferenceNames: () => ({}),
}));
vi.mock('../../client/lib/itam/ai-chat.js', () => ({
  useAiPageContext: () => ({ available: false, ask: () => undefined }),
  useItamAi: () => ({ available: false }),
}));
vi.mock('../../client/lib/itam/record-drawer.js', async (original) => ({
  ...(await original<object>()),
  useOpenRecord: () => () => undefined,
}));
// The pickers fetch their own options; choosing one is what matters here.
vi.mock('../../client/components/itam/reference-select.js', () => ({
  ReferenceSelect: ({
    value,
    onChange,
  }: {
    value: string | null;
    onChange: (value: string | null) => void;
  }) => (
    <button type='button' onClick={() => onChange('sam')}>
      {value ?? 'pick'}
    </button>
  ),
}));
vi.mock('../../client/lib/itam/recovery.js', async (original) => ({
  ...(await original<object>()),
  usePersonRecovery: () => ({ data: state.recovery }),
}));
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<object>()),
  useQueryClient: () => ({
    invalidateQueries: async () => undefined,
    fetchQuery: async () => {
      await state.gate;
      return state.after;
    },
  }),
  // Runs the mutation straight away, so the request it makes is what the
  // test reads.
  useMutation: ({
    mutationFn,
    onSuccess,
  }: {
    mutationFn: (input: unknown) => Promise<unknown>;
    onSuccess?: (data: unknown, input: unknown) => unknown;
  }) => ({
    mutate: (input: unknown) =>
      void mutationFn(input).then((data) => onSuccess?.(data, input)),
    mutateAsync: mutationFn,
    reset: () => undefined,
    isPending: false,
    error: undefined,
  }),
}));

const seat = (id: string) => ({
  kind: 'seat',
  id,
  label: 'Figma Organization',
  handling: 'reclaim',
  ownerId: 'mia',
  targetId: 'figma',
  assetType: 'entitlement',
});
const recovery = (overrides: Record<string, unknown>) => ({
  employmentStatus: 'left',
  leaveDate: '2026-10-01',
  items: [],
  settled: [],
  owned: [],
  settledOwned: [],
  progress: null,
  account: null,
  ...overrides,
});
const show = () =>
  render(
    <MemoryRouter>
      <TooltipProvider>
        <PersonBelongings personId='p1' personName='Chen Jie' />
      </TooltipProvider>
    </MemoryRouter>,
  );
/** Lets the batch's sequential requests run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  state.requests = [];
  state.failOn = undefined;
  state.recovery = recovery({});
  state.after = undefined;
  state.toasts = [];
  state.gate = undefined;
});

it('says what an act did, and how much of the handover is left', async () => {
  state.recovery = recovery({ items: [seat('s1'), seat('s2')] });
  // After the reclaim, one seat is still out.
  state.after = recovery({
    name: 'Chen Jie',
    items: [seat('s2')],
    progress: { done: 1, total: 2 },
  });
  show();
  const row = screen.getAllByText('Figma Organization')[0]!.closest('tr')!;
  fireEvent.click(
    within(row).getByRole('button', { name: /entitlements\.reclaimSeat/ }),
  );
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(
    within(dialog).getByRole('button', { name: /entitlements\.reclaimSeat/ }),
  );
  await settle();
  await settle();
  expect(state.toasts).toEqual([
    {
      type: 'success',
      title: 'people.recovery.toast.reclaimed',
      description: 'people.recovery.toast.remaining',
    },
  ]);
});

it("reclaims a seat by the seat's own id, not the row's key", async () => {
  // A device, a stock holding and a seat may share an id, so the table keys
  // rows by kind — which once leaked into the id this action sent.
  state.recovery = recovery({ items: [seat('c6543b22')] });
  show();
  const row = screen.getByText('Figma Organization').closest('tr')!;
  fireEvent.click(
    within(row).getByRole('button', { name: /entitlements\.reclaimSeat/ }),
  );
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(
    within(dialog).getByRole('button', { name: /entitlements\.reclaimSeat/ }),
  );
  expect(state.requests).toEqual([
    expect.objectContaining({
      path: expect.stringContaining('/figma/reclaim-seats'),
      json: { seatIds: ['c6543b22'] },
    }),
  ]);
});

it('takes everything ticked back at once, each its own way', async () => {
  state.recovery = recovery({
    items: [
      {
        kind: 'stock',
        id: 'h1',
        label: 'Dell dock',
        handling: 'takeBack',
        ownerId: 'mia',
        targetId: 'dock',
        quantity: 1,
        assetType: 'accessory',
      },
      seat('s1'),
      seat('s2'),
      // Waiting on a repair: no box, as it has no button.
      {
        kind: 'device',
        id: 'd1',
        label: 'SG-LT-006',
        handling: 'wait',
        status: 'inRepair',
        ownerId: 'mia',
        targetId: 'd1',
        assetType: 'device',
      },
    ],
  });
  show();
  expect(
    screen.getAllByRole('checkbox', { name: 'people.recovery.batch.select' }),
  ).toHaveLength(3);
  fireEvent.click(
    screen.getAllByRole('checkbox', {
      name: 'people.recovery.batch.selectAll',
    })[0]!,
  );
  fireEvent.click(
    screen.getByRole('button', { name: /people\.recovery\.batch\.recover/ }),
  );
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(
    within(dialog).getByRole('button', {
      name: /people\.recovery\.batch\.recover/,
    }),
  );
  await settle();
  expect(state.requests).toEqual([
    expect.objectContaining({
      path: expect.stringContaining('/dock/take-back'),
      json: { holderType: 'person', holderId: 'p1', quantity: 1 },
    }),
    // Both seats of one entitlement in one request, as its own page does.
    expect.objectContaining({
      path: expect.stringContaining('/figma/reclaim-seats'),
      json: { seatIds: ['s1', 's2'] },
    }),
  ]);
});

it('closes the batch before the toast, rather than showing it again emptied', async () => {
  state.recovery = recovery({ items: [seat('s1'), seat('s2')] });
  state.after = recovery({ name: 'Chen Jie', progress: { done: 2, total: 2 } });
  let release = () => undefined as void;
  state.gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  show();
  fireEvent.click(
    screen.getAllByRole('checkbox', {
      name: 'people.recovery.batch.selectAll',
    })[0]!,
  );
  fireEvent.click(
    screen.getByRole('button', { name: /people\.recovery\.batch\.recover/ }),
  );
  fireEvent.click(
    within(await screen.findByRole('dialog')).getByRole('button', {
      name: /people\.recovery\.batch\.recover/,
    }),
  );
  await settle();
  // The toast is still being worked out, and no dialog is left behind —
  // it used to stay open on the emptied selection, as 收回 0 项.
  expect(state.toasts).toEqual([]);
  expect(screen.queryByRole('dialog')).toBeNull();
  release();
  await settle();
  await settle();
  expect(state.toasts).toHaveLength(1);
});

it('keeps what failed ticked, with the reason, and settles the rest', async () => {
  state.recovery = recovery({
    items: [
      {
        kind: 'stock',
        id: 'h1',
        label: 'Dell dock',
        handling: 'takeBack',
        ownerId: 'mia',
        targetId: 'dock',
        quantity: 1,
        assetType: 'accessory',
      },
      seat('s1'),
    ],
  });
  state.failOn = 'reclaim-seats';
  show();
  fireEvent.click(
    screen.getAllByRole('checkbox', {
      name: 'people.recovery.batch.selectAll',
    })[0]!,
  );
  fireEvent.click(
    screen.getByRole('button', { name: /people\.recovery\.batch\.recover/ }),
  );
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(
    within(dialog).getByRole('button', {
      name: /people\.recovery\.batch\.recover/,
    }),
  );
  await settle();
  // The dialog stays open on what failed, naming it.
  expect(
    within(dialog).getByText(/Figma Organization — Not allowed/),
  ).toBeVisible();
  // Only the failed seat is still ticked. The open dialog hides the table
  // from the accessibility tree, so the boxes are looked up behind it.
  const boxes = screen.getAllByRole('checkbox', {
    name: 'people.recovery.batch.select',
    hidden: true,
  });
  expect(
    boxes.filter((box) => box.getAttribute('aria-checked') === 'true'),
  ).toHaveLength(1);
});

it('hands every ticked record to one new owner', async () => {
  state.recovery = recovery({
    owned: [
      {
        collection: 'repairs',
        id: 'r1',
        label: 'RP-000012',
        field: 'ownerId',
        ownerId: 'chen',
      },
      {
        collection: 'purchaseOrders',
        id: 'po1',
        label: 'PO-000018',
        field: 'ownerId',
        ownerId: 'chen',
      },
    ],
  });
  show();
  fireEvent.click(
    screen.getByRole('checkbox', { name: 'people.recovery.batch.selectAll' }),
  );
  fireEvent.click(
    screen.getByRole('button', { name: /people\.recovery\.batch\.handOver/ }),
  );
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'pick' }));
  fireEvent.click(
    within(dialog).getByRole('button', {
      name: /people\.recovery\.batch\.handOver/,
    }),
  );
  await settle();
  expect(state.requests).toEqual([
    expect.objectContaining({
      path: expect.stringContaining('/r1'),
      method: 'PATCH',
      json: { ownerId: 'sam' },
    }),
    expect.objectContaining({
      path: expect.stringContaining('/po1'),
      method: 'PATCH',
      json: { ownerId: 'sam' },
    }),
  ]);
});
