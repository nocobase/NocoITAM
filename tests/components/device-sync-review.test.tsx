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
  create: undefined as Record<string, unknown> | undefined,
  device: undefined as Record<string, unknown> | undefined,
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
vi.mock('../../client/lib/itam/api.js', () => ({
  useItamRecord: (_path: string, id: string | undefined) => ({
    data: id ? state.device : undefined,
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
  DeviceCreateDialog: (props: Record<string, unknown>) => {
    state.create = props.open ? props : undefined;
    return null;
  },
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
    // A long reason is cut short rather than widening the table.
    expect(
      within(section).getByText('Wiped for every release').className,
    ).toContain('truncate');
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

describe('MDM 核对 → 信息不一致: 已忽略', () => {
  const check = {
    kind: 'stale',
    critical: false,
    deviceId: 'd9',
    deviceNo: 'DE-000009',
    deviceName: 'SG-LT-009',
    status: 'inUse',
    ownerId: 'mia',
    assigneeType: 'person',
    assigneeId: 'pat',
    managedDeviceId: 'm9',
    source: 'intune',
    lastSyncAt: '2026-08-29T06:10:00.000',
    goneAt: null,
    personId: null,
    userName: null,
  };

  beforeEach(() => {
    state.action.mockReset();
  });

  it('lists the differences a person ignored beneath, with 恢复', () => {
    state.views = {
      checks: [],
      dismissed: [
        {
          ...check,
          dismissedById: 'mia',
          dismissedAt: '2026-10-16T09:00:00.000',
        },
      ],
    };
    render(
      <MemoryRouter initialEntries={['/device-sync']}>
        <DeviceSyncReviewPage />
      </MemoryRouter>,
    );
    const section = screen
      .getByText('deviceSync.review.dismissedHeading:1')
      .closest('section')!;
    expect(within(section).getByText('Mia')).toBeInTheDocument();
    fireEvent.click(
      within(section).getByRole('button', {
        name: 'deviceSync.review.restore',
      }),
    );
    expect(state.action).toHaveBeenCalledWith({
      kind: 'undismiss',
      deviceId: 'd9',
      check: 'stale',
    });
  });
});

describe('MDM 核对 → 只在 MDM: 补登记', () => {
  const record = (serialNo: string | null) => ({
    id: 'm1',
    source: 'intune',
    sources: ['intune'],
    externalId: 'demo-x',
    serialNo,
    deviceName: 'LAPTOP-X',
    manufacturer: 'Lenovo',
    model: 'ThinkPad T14 Gen 5',
    userName: null,
    personId: null,
    osName: 'Windows',
    osVersion: '11',
    ownership: 'company',
    lastSyncAt: '2026-10-16T06:10:00.000',
    matchState: 'unlinked',
    candidates: [],
    suggestedModelId: null,
    ignoredByRule: false,
    consoleUrl: null,
  });
  const open = () => {
    render(
      <MemoryRouter initialEntries={['/device-sync?view=unregistered']}>
        <DeviceSyncReviewPage />
      </MemoryRouter>,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'deviceSync.review.register' }),
    );
  };

  it('locks the serial the new device will be linked by', () => {
    state.views = { unregistered: [record('PF5DEMO01')] };
    open();
    expect(state.create).toMatchObject({
      initial: { serialNo: 'PF5DEMO01' },
      locked: { serialNo: 'deviceSync.review.serialFromPlatform' },
    });
  });

  it('starts it in use by the primary user when they are a person on the register', () => {
    state.views = {
      unregistered: [{ ...record('PF5DEMO01'), personId: 'p1' }],
    };
    open();
    expect(state.create?.initial).toMatchObject({
      startStatus: 'inUse',
      assigneeId: 'p1',
    });
  });

  it('warns when the device picked to link has another serial', () => {
    state.views = {
      unregistered: [
        { ...record('PF5DEMO01'), candidates: [{ id: 'd1', label: 'X' }] },
      ],
    };
    state.device = { id: 'd1', serialNo: 'OTHER-1' };
    render(
      <MemoryRouter initialEntries={['/device-sync?view=unregistered']}>
        <DeviceSyncReviewPage />
      </MemoryRouter>,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'deviceSync.review.link' }),
    );
    expect(
      screen.getByText('deviceSync.review.serialMismatch'),
    ).toBeInTheDocument();
  });

  it('says nothing when it is the same serial, written otherwise', () => {
    state.views = {
      unregistered: [
        { ...record('PF5DEMO01'), candidates: [{ id: 'd1', label: 'X' }] },
      ],
    };
    state.device = { id: 'd1', serialNo: ' pf5demo01 ' };
    render(
      <MemoryRouter initialEntries={['/device-sync?view=unregistered']}>
        <DeviceSyncReviewPage />
      </MemoryRouter>,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'deviceSync.review.link' }),
    );
    expect(screen.queryByText('deviceSync.review.serialMismatch')).toBeNull();
  });

  it('leaves it to be typed when the platform has none', () => {
    state.views = { unregistered: [record(null)] };
    open();
    expect(state.create?.locked).toBeUndefined();
  });
});
