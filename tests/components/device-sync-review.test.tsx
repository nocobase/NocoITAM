import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  records: [] as Record<string, unknown>[],
  ai: false,
  // MDM 跟进 runs still open, and what the reader may do to devices.
  open: [] as {
    agent: string;
    subjectId?: string;
    status?: string;
    result?: unknown;
  }[],
  permissions: {} as Record<string, boolean>,
  followUp: {
    mutate: vi.fn(),
    isPending: false,
    isSuccess: false,
    data: undefined as unknown[] | undefined,
    error: null,
  },
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
  useManagedDevices: (id: string | undefined) => ({
    data: id ? { data: state.records } : undefined,
  }),
}));
vi.mock('../../client/lib/itam/api.js', () => ({
  useItamRecord: (_path: string, id: string | undefined) => ({
    data: id ? state.device : undefined,
  }),
  useItamSettings: () => ({
    data: { deviceSync: { staleDays: 30, recentDays: 7 } },
  }),
}));
vi.mock('../../client/lib/itam/ai-chat.js', () => ({
  useItamAi: () => ({ available: state.ai, ask: vi.fn() }),
}));
vi.mock('../../client/lib/itam/agents.js', () => ({
  useAskFollowUp: () => state.followUp,
  useInbox: () => ({ data: { open: state.open, handled: [] } }),
}));
vi.mock('../../client/lib/itam/permissions.js', () => ({
  useCollectionPermissions: () => state.permissions,
}));
vi.mock('../../client/components/itam/ai/device-sync-run.js', () => ({
  DeviceSyncFollowUpBlock: () => <p>follow-up block</p>,
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
    state.ai = false;
    state.followUp = {
      mutate: vi.fn(),
      isPending: false,
      isSuccess: false,
      data: undefined,
      error: null,
    };
  });

  // MDM 跟进 on the page (2026-10-17): the follow-up for the reader, now.
  it('offers MDM follow-up while a model is usable, and asks for it', () => {
    const { unmount } = show();
    expect(
      screen.queryByRole('button', { name: 'deviceSync.review.followUp' }),
    ).not.toBeInTheDocument();
    unmount();
    state.ai = true;
    show();
    fireEvent.click(
      screen.getByRole('button', { name: 'deviceSync.review.followUp' }),
    );
    expect(state.followUp.mutate).toHaveBeenCalled();
  });

  it('shows the reader’s follow-ups, and says when nothing was new', () => {
    state.ai = true;
    state.followUp = { ...state.followUp, isSuccess: true, data: [{}] };
    const { unmount } = show();
    // The cards are the page's 等你决定, a run just asked for among them.
    expect(screen.getByText('follow-up block')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    unmount();
    state.followUp = { ...state.followUp, data: [] };
    show();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'deviceSync.review.followUpNothing',
    );
  });

  it('marks a device 不需要纳管 with a reason', () => {
    state.views = { unmanaged: [unmanaged] };
    show();
    // The serial to find it by in MDM, and its model.
    expect(screen.getByText('LNX-001')).toBeInTheDocument();
    // Who answers for it (2026-10-17).
    expect(screen.getByText('Mia')).toBeInTheDocument();
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
    // Who marked it, and who answers for the device.
    expect(within(section).getAllByText(/Mia/)).toHaveLength(2);
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
      <MemoryRouter initialEntries={['/device-sync?view=checks']}>
        <DeviceSyncReviewPage />
      </MemoryRouter>,
    );
    const section = screen
      .getByText('deviceSync.review.dismissedHeading:1')
      .closest('section')!;
    // Who and when in one column, the date first.
    expect(within(section).getByText(/· Mia$/)).toBeInTheDocument();
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

// Each difference with what settles it (2026-10-21): the device page's own
// dialog, opened through `?do=`; 忽略 under "···".
describe('MDM 核对 → 信息不一致', () => {
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
  const show = () =>
    render(
      <MemoryRouter initialEntries={['/device-sync?view=checks']}>
        <DeviceSyncReviewPage />
      </MemoryRouter>,
    );

  beforeEach(() => {
    state.action.mockReset();
    state.permissions = { update: true, assign: true, transfer: true };
  });

  it('marks a silent device lost, and ignores it from the menu', async () => {
    state.views = { checks: [check] };
    show();
    expect(
      screen.getByRole('button', { name: 'deviceActions.markLost.title' }),
    ).toHaveAttribute('href', '/devices/d9?do=markLost');
    screen.getByRole('button', { name: 'common.more' }).focus();
    await userEvent.keyboard('{ArrowDown}');
    fireEvent.click(
      await screen.findByRole('menuitem', {
        name: 'deviceSync.checks.keepRegister',
      }),
    );
    expect(state.action).toHaveBeenCalledWith({
      kind: 'dismiss',
      deviceId: 'd9',
      check: 'stale',
    });
  });

  it('moves a device to the platform’s user', () => {
    state.views = {
      checks: [
        { ...check, kind: 'userMismatch', personId: 'p2', userName: 'Liu' },
      ],
    };
    show();
    expect(
      screen.getByRole('button', { name: 'deviceSync.checks.transferTo' }),
    ).toHaveAttribute('href', '/devices/d9?do=transfer&to=p2');
  });

  it('opens the device without the grant to settle it', () => {
    state.permissions = {};
    state.views = { checks: [check] };
    show();
    expect(screen.getByRole('button', { name: 'common.view' })).toHaveAttribute(
      'href',
      '/devices/d9',
    );
  });

  it('leads with 忽略 where the follow-up says the register is right', () => {
    state.views = { checks: [check] };
    state.open = [
      {
        agent: 'deviceSync',
        subjectId: 'shared:mia',
        status: 'pending',
        result: {
          advice: [
            {
              subject: 'd9',
              kind: 'stale',
              action: 'keep',
              reason: null,
              target: null,
              planned: true,
            },
          ],
        },
      },
    ];
    show();
    fireEvent.click(
      screen.getByRole('button', { name: 'deviceSync.checks.keepRegister' }),
    );
    expect(state.action).toHaveBeenCalledWith({
      kind: 'dismiss',
      deviceId: 'd9',
      check: 'stale',
    });
    state.open = [];
  });

  // The cards each run again on their own (2026-10-22): no header button
  // while one is there.
  it('leaves running again to the cards while both wait', () => {
    state.ai = true;
    state.views = { checks: [check] };
    state.open = [
      { agent: 'deviceSync', subjectId: 'owner:mia' },
      { agent: 'deviceSync', subjectId: 'shared:mia' },
    ];
    show();
    expect(
      screen.queryByRole('button', { name: 'deviceSync.review.followUp' }),
    ).toBeNull();
    state.open = [];
    state.ai = false;
  });

  // One set aside, its part has no card: the header starts it alone
  // (2026-10-22).
  it('starts the part with no card alone', () => {
    state.ai = true;
    state.views = { checks: [check] };
    state.open = [{ agent: 'deviceSync', subjectId: 'shared:mia' }];
    show();
    fireEvent.click(
      screen.getByRole('button', { name: 'deviceSync.review.followUp' }),
    );
    expect(state.followUp.mutate).toHaveBeenCalledWith('own');
    state.open = [];
    state.ai = false;
  });

  it('offers it again after one failed', () => {
    state.ai = true;
    state.views = { checks: [check] };
    state.open = [
      { agent: 'deviceSync', subjectId: 'owner:mia', status: 'failed' },
    ];
    show();
    expect(
      screen.getByRole('button', { name: 'deviceSync.review.followUp' }),
    ).toBeInTheDocument();
    state.open = [];
    state.ai = false;
  });
});

describe('MDM 核对 → 只在 MDM: 手动关联', () => {
  it('lists records linked by hand with their device, and unlinks one', () => {
    state.action.mockReset();
    state.views = {
      unregistered: [],
      linked: [
        {
          id: 'm7',
          source: 'intune',
          sources: ['intune'],
          externalId: 'demo-x',
          serialNo: 'MDM-1',
          deviceName: 'LAPTOP-X',
          how: 'registered',
          ownership: 'company',
          compliance: 'compliant',
          linkedDevice: {
            id: 'd7',
            deviceNo: 'DE-000007',
            name: 'SG-LT-007',
            serialNo: 'REG-1',
          },
        },
      ],
    };
    render(
      <MemoryRouter initialEntries={['/device-sync?view=unregistered']}>
        <DeviceSyncReviewPage />
      </MemoryRouter>,
    );
    const section = screen
      .getByText('deviceSync.review.linkedHeading:1')
      .closest('section')!;
    // Registered, said so (2026-10-22); its name opens the platform's record.
    expect(
      within(section).getByText('deviceSync.review.how.registered'),
    ).toBeInTheDocument();
    fireEvent.click(within(section).getByRole('button', { name: 'LAPTOP-X' }));
    expect(
      screen.getByText('deviceSync.review.recordTitle'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('deviceSync.compliance.compliant'),
    ).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape',
    });
    expect(
      within(section).getByRole('link', { name: 'DE-000007 / SG-LT-007' }),
    ).toHaveAttribute('href', '/devices/d7');
    // A serial that is not the platform's is said, marked, beside the
    // device (2026-10-22).
    expect(
      within(section).getByText('deviceSync.review.registerSerial').className,
    ).toContain('text-warning-foreground');
    fireEvent.click(
      within(section).getByRole('button', { name: 'deviceSync.unlink' }),
    );
    expect(state.action).toHaveBeenCalledWith({
      kind: 'unlink',
      managedId: 'm7',
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
      unregistered: [
        {
          ...record('PF5DEMO01'),
          personId: 'p1',
          suggestedLocationId: 'loc-3f',
        },
      ],
    };
    open();
    // Kept where they sit (2026-10-22).
    expect(state.create?.initial).toMatchObject({
      startStatus: 'inUse',
      assigneeId: 'p1',
      locationId: 'loc-3f',
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
      screen.getByText('deviceSync.review.linkConflicts.serialMismatch'),
    ).toBeInTheDocument();
  });

  it('shows what the link brings up, and the device it linked to afterwards', () => {
    state.views = {
      unregistered: [
        {
          ...record('PF5DEMO01'),
          personId: 'p-mdm',
          userName: 'Kim',
          lastSyncAt: new Date().toISOString(),
          candidates: [{ id: 'd1', label: 'X' }],
        },
      ],
    };
    state.device = {
      id: 'd1',
      deviceNo: 'DE-000001',
      name: 'SG-LT-001',
      serialNo: 'PF5DEMO01',
      status: 'inUse',
      assigneeType: 'person',
      assigneeId: 'p-other',
    };
    render(
      <MemoryRouter initialEntries={['/device-sync?view=unregistered']}>
        <DeviceSyncReviewPage />
      </MemoryRouter>,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'deviceSync.review.link' }),
    );
    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByText('deviceSync.review.linkConflicts.userMismatch'),
    ).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'actions.confirm' }),
    );
    expect(state.action).toHaveBeenCalledWith({
      kind: 'link',
      managedId: 'm1',
      deviceId: 'd1',
    });
    // The row is gone; what it became stays in view.
    expect(screen.getByText('deviceSync.review.linked')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'DE-000001 / SG-LT-001' }),
    ).toHaveAttribute('href', '/devices/d1');
    expect(
      screen.getByText('deviceSync.review.linkedDiffers'),
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
    expect(
      screen.queryByText('deviceSync.review.linkConflicts.serialMismatch'),
    ).toBeNull();
  });

  it('links the record to the device registered from it', async () => {
    state.action.mockReset();
    state.views = { unregistered: [record('PF5DEMO01')] };
    open();
    await (
      state.create?.onCreated as (
        created: Record<string, unknown>,
      ) => Promise<void>
    )({ id: 'new-1', deviceNo: 'DE-000099' });
    expect(state.action).toHaveBeenCalledWith({
      kind: 'link',
      managedId: 'm1',
      deviceId: 'new-1',
    });
  });

  it('offers no 补登记 when a register device already has the serial', () => {
    state.views = {
      unregistered: [
        { ...record('PF5DEMO01'), candidates: [{ id: 'd1', label: 'X' }] },
      ],
    };
    render(
      <MemoryRouter initialEntries={['/device-sync?view=unregistered']}>
        <DeviceSyncReviewPage />
      </MemoryRouter>,
    );
    expect(
      screen.queryByRole('button', { name: 'deviceSync.review.register' }),
    ).toBeNull();
    expect(
      screen.getByRole('button', { name: 'deviceSync.review.link' }),
    ).toBeInTheDocument();
  });

  it('lists records silent too long beneath', () => {
    state.views = { unregistered: [], silent: [record('OLD-1')] };
    render(
      <MemoryRouter initialEntries={['/device-sync?view=unregistered']}>
        <DeviceSyncReviewPage />
      </MemoryRouter>,
    );
    const section = screen
      .getByText('deviceSync.review.silentHeading:1')
      .closest('section')!;
    expect(within(section).getByText('OLD-1')).toBeInTheDocument();
  });

  it('warns when the device already has another record of the platform', () => {
    state.views = {
      unregistered: [
        { ...record('PF5DEMO01'), candidates: [{ id: 'd1', label: 'X' }] },
      ],
    };
    state.device = { id: 'd1', serialNo: 'PF5DEMO01', status: 'inStock' };
    state.records = [{ id: 'other', source: 'intune', goneAt: null }];
    render(
      <MemoryRouter initialEntries={['/device-sync?view=unregistered']}>
        <DeviceSyncReviewPage />
      </MemoryRouter>,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'deviceSync.review.link' }),
    );
    expect(
      screen.getByText('deviceSync.review.linkConflicts.alreadyLinked'),
    ).toBeInTheDocument();
    state.records = [];
  });

  it('leaves it to be typed when the platform has none', () => {
    state.views = { unregistered: [record(null)] };
    open();
    expect(state.create?.locked).toBeUndefined();
  });

  // What MDM 跟进 suggested, on its row (2026-10-21): marked, its button
  // first, with the reason it gave filled in.
  it('leads with what the follow-up suggested, and fills in its reason', () => {
    state.views = { unregistered: [record('PF5DEMO01')] };
    state.open = [
      {
        agent: 'deviceSync',
        subjectId: 'shared:mia',
        status: 'pending',
        result: {
          advice: [
            {
              subject: 'm1',
              kind: 'unregistered',
              action: 'ignore',
              reason: 'A contractor’s laptop',
              target: null,
              planned: true,
            },
          ],
        },
      },
    ];
    render(
      <MemoryRouter initialEntries={['/device-sync?view=unregistered']}>
        <DeviceSyncReviewPage />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText('deviceSync.advice.says')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'deviceSync.review.register' }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'deviceSync.review.ignore' }),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('A contractor’s laptop');
    state.open = [];
  });
});
