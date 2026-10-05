import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';

import { PersonBelongings } from '../../client/components/itam/person-belongings.js';
import { TooltipProvider } from '../../client/components/ui/tooltip.js';

const state = vi.hoisted(() => ({
  requests: [] as { path: string; json?: unknown }[],
}));

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('../../client/lib/itam/api.js', () => ({
  useApi: () => ({
    request: async (request: { path: string; json?: unknown }) => {
      state.requests.push(request);
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
vi.mock('../../client/lib/itam/ai-context.js', () => ({
  useAiPageContext: () => ({
    ref: () => undefined,
    available: false,
    ask: () => undefined,
  }),
}));
vi.mock('../../client/lib/itam/record-drawer.js', async (original) => ({
  ...(await original<object>()),
  useOpenRecord: () => () => undefined,
}));
// One seat in their name: a device, a stock holding and a seat may share an
// id, so the table keys rows by kind — which is what once leaked into the
// id the seat's own action sent.
vi.mock('../../client/lib/itam/recovery.js', async (original) => ({
  ...(await original<object>()),
  usePersonRecovery: () => ({
    data: {
      employmentStatus: 'left',
      leaveDate: '2026-10-01',
      items: [
        {
          kind: 'seat',
          id: 'c6543b22',
          label: 'Figma Organization',
          handling: 'reclaim',
          ownerId: 'mia',
          account: 'chen.jie@example.com',
          targetId: 'figma',
          assetType: 'entitlement',
        },
      ],
      settled: [],
      owned: [],
      settledOwned: [],
      progress: null,
      account: null,
    },
  }),
}));
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<object>()),
  useQueryClient: () => ({ invalidateQueries: async () => undefined }),
  // Runs the mutation straight away, so the request it makes is what the
  // test reads.
  useMutation: ({
    mutationFn,
  }: {
    mutationFn: (input: unknown) => Promise<unknown>;
  }) => ({
    mutate: (input: unknown) => void mutationFn(input),
    mutateAsync: mutationFn,
    reset: () => undefined,
    isPending: false,
    error: undefined,
  }),
}));

beforeEach(() => {
  state.requests = [];
});

it("reclaims a seat by the seat's own id, not the row's key", async () => {
  render(
    <MemoryRouter>
      <TooltipProvider>
        <PersonBelongings personId='p1' personName='Chen Jie' />
      </TooltipProvider>
    </MemoryRouter>,
  );
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
