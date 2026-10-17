import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import DisposalFlowSettingsPage from '../../client/pages/itam/settings/disposal-flow.js';

const state = vi.hoisted(() => ({
  range: undefined as unknown,
  saves: [] as Record<string, unknown>[],
  error: null as unknown,
}));

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { names?: string }) =>
      options?.names === undefined ? key : `${key}:${options.names}`,
  }),
}));
vi.mock('#components/lifecycle-diagram', () => ({
  LifecycleDiagram: () => <div role='img' aria-label='diagram' />,
}));
vi.mock('#components/page-container', () => ({
  PageContainer: ({ children }: { children: unknown }) => (
    <div>{children as never}</div>
  ),
}));
vi.mock('#components/page-header', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock('../../client/lib/itam/lifecycle.js', () => ({
  newRequestId: (() => {
    let n = 0;
    return () => `req-${String((n += 1))}`;
  })(),
  useLifecycleDescription: () => ({
    data: { name: 'disposals', stateInfo: [], transitions: [] },
  }),
  useDisposalApproverRange: () => ({ data: state.range }),
  useSaveDisposalApproverRange: () => ({
    mutate: (
      input: Record<string, unknown>,
      options?: { onError?: () => void },
    ) => {
      state.saves.push(input);
      if (state.error) options?.onError?.();
    },
    isPending: false,
    isSuccess: false,
    error: state.error,
  }),
}));

const ANN = { id: 'ann', name: 'Ann' };
const MIA = { id: 'mia', name: 'Mia' };

beforeEach(() => {
  state.saves = [];
  state.error = null;
  state.range = {
    anyone: true,
    roles: [],
    users: [],
    revision: 2,
    updatedById: 'mia',
    updatedAt: '2026-10-18T08:00:00Z',
    roleOptions: [{ key: 'finance', title: 'Finance' }],
    userOptions: [ANN, MIA],
    approvers: [ANN, MIA],
  };
});

it('shows the flow and whom a submitter may pick, everyone by default', () => {
  render(<DisposalFlowSettingsPage />);
  expect(screen.getByRole('img', { name: 'diagram' })).toBeTruthy();
  expect(
    screen.getByText('settings.disposalFlow.current:Ann、Mia'),
  ).toBeTruthy();
  // Everyone: nothing to tick.
  expect(screen.queryByText('Finance')).toBeNull();
});

it('narrows the range to what is ticked and saves it against the version shown', () => {
  render(<DisposalFlowSettingsPage />);
  fireEvent.click(
    screen.getByRole('radio', { name: 'settings.disposalFlow.chosen' }),
  );
  fireEvent.click(screen.getByRole('checkbox', { name: 'Finance' }));
  fireEvent.click(screen.getByRole('button', { name: /actions\.save/ }));
  expect(state.saves).toEqual([
    {
      anyone: false,
      roles: ['finance'],
      users: [],
      revision: 2,
      requestId: expect.stringMatching(/^req-/),
    },
  ]);
});

it('keeps what was written after a conflict and saves it again under a new key', () => {
  state.error = {
    response: { data: { code: 'BUSINESS_RULE', rule: 'CONFLICT' } },
  };
  render(<DisposalFlowSettingsPage />);
  fireEvent.click(
    screen.getByRole('radio', { name: 'settings.disposalFlow.chosen' }),
  );
  fireEvent.click(screen.getByRole('checkbox', { name: 'Ann' }));
  const save = screen.getByRole('button', { name: /actions\.save/ });
  fireEvent.click(save);
  fireEvent.click(save);
  expect(state.saves).toHaveLength(2);
  expect(state.saves[1]).toMatchObject({ anyone: false, users: ['ann'] });
  expect(state.saves[1]?.requestId).not.toBe(state.saves[0]?.requestId);
});
