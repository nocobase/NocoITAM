import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import DeviceSyncReviewPage from '../../client/pages/itam/device-sync.js';
import type {
  ExemptDevice,
  UnmanagedDevice,
} from '../../client/lib/itam/device-sync.js';

const state = vi.hoisted(() => ({
  views: {} as Record<string, unknown[]>,
  action: vi.fn(),
}));

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options && 'count' in options ? `${key}:${String(options.count)}` : key,
    i18n: { language: 'en' },
  }),
}));
vi.mock('@nocobase/app-plugin-authorization/client', () => ({
  useCan: () => ({ can: false, isPending: false }),
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('../../client/lib/itam/device-sync.js', () => ({
  DEVICE_SYNC_PATH: '/itam/device-sync',
  useDeviceReview: (view: string) => ({
    data: state.views[view] ?? [],
    isLoading: false,
  }),
  useDeviceReviewAction: () => ({
    mutate: (variables: unknown, options?: { onSuccess?: () => void }) => {
      state.action(variables);
      options?.onSuccess?.();
    },
    isPending: false,
    error: null,
  }),
}));
vi.mock('../../client/lib/itam/ai-chat.js', () => ({
  useItamAi: () => ({ available: false, ask: vi.fn() }),
}));
vi.mock('../../client/lib/itam/references.js', () => ({
  useReferenceNames: () => ({
    users: new Map([['mia', 'Mia']]),
    models: new Map([['model-1', 'Dell OptiPlex 7020']]),
  }),
}));
vi.mock('../../client/components/itam/holder-link.js', () => ({
  HolderLink: ({ holderId }: { holderId: string }) => (
    <a href={`/people/${holderId}`}>person:{holderId}</a>
  ),
}));
vi.mock('../../client/components/itam/device-create-dialog.js', () => ({
  DeviceCreateDialog: () => null,
}));
vi.mock('../../client/components/itam/reference-select.js', () => ({
  ReferenceSelect: () => null,
}));

const unmanaged: UnmanagedDevice = {
  id: 'd1',
  deviceNo: 'DE-000001',
  name: 'LINUX-WS',
  serialNo: 'LNX-001',
  modelId: 'model-1',
  categoryId: 'cat-desktop',
  ownerId: 'mia',
  assigneeType: 'person',
  assigneeId: 'pat',
};
const exempt: ExemptDevice = {
  ...unmanaged,
  id: 'd2',
  deviceNo: 'DE-000002',
  name: 'TEST-PHONE',
  reason: 'Wiped for every release',
  exemptedById: 'mia',
  exemptedAt: '2026-10-15T09:00:00.000',
};

const show = () =>
  render(
    <MemoryRouter initialEntries={['/device-sync?view=unmanaged']}>
      <DeviceSyncReviewPage />
    </MemoryRouter>,
  );

describe('MDM 核对 → 只在台账', () => {
  beforeEach(() => {
    state.views = {};
    state.action.mockReset();
  });

  it('marks a device 不需要纳管 with a reason', () => {
    state.views = { unmanaged: [unmanaged] };
    show();
    // The serial to find it by in MDM, and its model.
    expect(screen.getByText('LNX-001')).toBeInTheDocument();
    expect(screen.getByText('Dell OptiPlex 7020')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'deviceSync.review.exempt' }),
    );
    const dialog = screen.getByRole('dialog');
    const confirm = within(dialog).getByRole('button', {
      name: 'actions.confirm',
    });
    // No reason, no mark.
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByRole('textbox'), {
      target: { value: ' Linux workstation ' },
    });
    fireEvent.click(confirm);
    expect(state.action).toHaveBeenCalledWith({
      kind: 'exempt',
      deviceId: 'd1',
      reason: 'Linux workstation',
    });
  });

  it('lists the devices marked so beneath, with the reason and 恢复', () => {
    state.views = { unmanaged: [unmanaged], exempted: [exempt] };
    show();
    const section = screen
      .getByText('deviceSync.review.exemptedHeading:1')
      .closest('section')!;
    expect(
      within(section).getByText('Wiped for every release'),
    ).toBeInTheDocument();
    expect(within(section).getByText(/Mia/)).toBeInTheDocument();
    fireEvent.click(
      within(section).getByRole('button', {
        name: 'deviceSync.review.restore',
      }),
    );
    expect(state.action).toHaveBeenCalledWith({
      kind: 'unexempt',
      deviceId: 'd2',
    });
  });

  it('has no such section while nothing is marked', () => {
    state.views = { unmanaged: [unmanaged] };
    show();
    expect(
      screen.queryByText(/deviceSync\.review\.exemptedHeading/),
    ).not.toBeInTheDocument();
  });
});
