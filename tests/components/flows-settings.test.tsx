import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';

import FlowsSettingsPage from '../../client/pages/itam/settings/flows.js';

const state = vi.hoisted(() => ({
  range: undefined as unknown,
  /** The API paths the page read, newest last. */
  paths: [] as string[],
  saves: [] as Record<string, unknown>[],
  error: null as unknown,
}));

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { names?: string; name?: string }) =>
      options?.names !== undefined
        ? `${key}:${options.names}`
        : options?.name !== undefined
          ? `${key}:${options.name}`
          : key,
    i18n: { language: 'zh-CN' },
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
vi.mock('../../client/lib/itam/references.js', () => ({
  useReferenceNames: () => ({ users: new Map([['mia', 'Mia']]) }),
}));
vi.mock('../../client/lib/itam/lifecycle.js', () => ({
  newRequestId: (() => {
    let n = 0;
    return () => `req-${String((n += 1))}`;
  })(),
  useLifecycleDescription: (path: string) => {
    state.paths.push(path);
    return { data: { name: path, stateInfo: [], transitions: [] } };
  },
  useApproverRange: () => ({ data: state.range }),
  useSaveApproverRange: () => ({
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

const show = (address = '/settings/flows') =>
  render(
    <MemoryRouter initialEntries={[address]}>
      <FlowsSettingsPage />
    </MemoryRouter>,
  );

/** Opens a dropdown by its label and picks an option in it. */
const pick = async (label: string, option: string) => {
  fireEvent.click(screen.getByLabelText(label));
  const listbox = await screen.findByRole('listbox');
  fireEvent.click(within(listbox).getByRole('option', { name: option }));
};

const ANN = { id: 'ann', name: 'Ann' };
const MIA = { id: 'mia', name: 'Mia' };

beforeEach(() => {
  state.paths = [];
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
  show();
  expect(screen.getByRole('img', { name: 'diagram' })).toBeTruthy();
  expect(screen.getByText('settings.flows.current:Ann、Mia')).toBeTruthy();
  // Nothing chosen: everyone; nothing changed, nothing to save.
  expect(screen.getAllByText('settings.flows.choose')).toHaveLength(2);
  expect(
    screen
      .getByRole('button', { name: /actions\.save/ })
      .hasAttribute('disabled'),
  ).toBe(true);
  // Who set the version shown.
  expect(screen.getByText('settings.flows.version:Mia')).toBeTruthy();
});

it('narrows the range to what is chosen and saves it against the version shown', async () => {
  show();
  await pick('settings.flows.byRole', 'Finance');
  await waitFor(() =>
    expect(
      screen.getByLabelText('settings.flows.byRole').textContent,
    ).toContain('Finance'),
  );
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

it('keeps what was written after a conflict and saves it again under a new key', async () => {
  state.error = {
    response: { data: { code: 'BUSINESS_RULE', rule: 'CONFLICT' } },
  };
  show();
  await pick('settings.flows.byPerson', 'Ann');
  const save = screen.getByRole('button', { name: /actions\.save/ });
  fireEvent.click(save);
  fireEvent.click(save);
  expect(state.saves).toHaveLength(2);
  expect(state.saves[1]).toMatchObject({ anyone: false, users: ['ann'] });
  expect(state.saves[1]?.requestId).not.toBe(state.saves[0]?.requestId);
});

it('warns when the saved range is left with nobody to pick', () => {
  state.range = {
    ...(state.range as object),
    anyone: false,
    users: ['lee'],
    approvers: [],
  };
  show();
  expect(screen.getByRole('alert').textContent).toBe(
    'settings.flows.nobodyLeft',
  );
});

it('opens on purchase orders, and on the flow the address names', () => {
  show();
  expect(state.paths.at(-1)).toBe('itam/purchase-orders');
  expect(
    screen
      .getByRole('tab', { name: 'settings.flows.procurement' })
      .getAttribute('aria-selected'),
  ).toBe('true');
  state.paths = [];
  show('/settings/flows?kind=disposals');
  expect(state.paths.at(-1)).toBe('itam/disposals');
});
