import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ManagedPlatforms } from '../../client/components/itam/managed-platforms.js';
import { DeviceSyncCard } from '../../client/pages/itam/settings/device-sync-card.js';
import type {
  DeviceCheck,
  DeviceConnection,
  ManagedDevice,
  OnlineAfterLeaving,
  SourceStatus,
} from '../../client/lib/itam/device-sync.js';
import { LeaverOnlineDevices } from '../../client/components/itam/leaver-online-devices.js';

const state = vi.hoisted(() => ({
  managed: undefined as
    | { data: ManagedDevice[]; connected: boolean; checks?: DeviceCheck[] }
    | undefined,
  review: vi.fn(),
  ask: vi.fn(),
  online: [] as OnlineAfterLeaving[],
  status: [] as SourceStatus[],
  start: vi.fn(),
  connections: [] as DeviceConnection[],
  secretsReady: true,
  save: vi.fn(),
  remove: vi.fn(),
  test: vi.fn(),
  testResult: undefined as unknown,
}));
/** A mutation's surface as the card uses it; `onSuccess` runs at once. */
const mutation = (spy: ReturnType<typeof vi.fn>, data?: () => unknown) => ({
  mutate: (variables: unknown, options?: { onSuccess?: () => void }) => {
    spy(variables);
    options?.onSuccess?.();
  },
  reset: () => undefined,
  isPending: false,
  error: null,
  data: data?.(),
});

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options && 'count' in options ? `${key}:${String(options.count)}` : key,
    i18n: { language: 'en' },
  }),
}));
vi.mock('../../client/lib/itam/device-sync.js', () => ({
  useManagedDevices: () => ({ data: state.managed }),
  useDeviceSyncStatus: () => ({ data: state.status }),
  useOnlineAfterLeaving: () => ({ data: state.online }),
  useDeviceReviewAction: () => ({
    mutate: state.review,
    isPending: false,
    error: null,
  }),
  useStartDeviceSync: () => ({
    mutate: state.start,
    isPending: false,
    error: null,
  }),
  useDeviceConnections: () => ({
    data: { secretsReady: state.secretsReady, connections: state.connections },
  }),
  useDeviceConnectionActions: () => ({
    save: mutation(state.save),
    remove: mutation(state.remove),
    test: mutation(state.test, () => state.testResult),
  }),
}));
vi.mock('../../client/lib/itam/ai-chat.js', () => ({
  useItamAi: () => ({ available: true, ask: state.ask }),
}));
vi.mock('../../client/lib/itam/references.js', () => ({
  useReferenceNames: () => ({ users: new Map([['mia', 'Mia']]) }),
}));
vi.mock('../../client/components/itam/holder-link.js', () => ({
  HolderLink: ({ holderId }: { holderId: string }) => (
    <a href={`/people/${holderId}`}>person:{holderId}</a>
  ),
}));

const record: ManagedDevice = {
  id: 'm1',
  source: 'intune',
  externalId: 'abc',
  deviceName: 'LAPTOP-01',
  manufacturer: 'Lenovo',
  model: 'ThinkPad T14',
  osName: 'Windows',
  osVersion: '10.0.26100',
  userPrincipal: 'pat@example.com',
  userName: 'Pat Lee',
  personId: 'person-pat',
  ownership: 'company',
  compliance: 'compliant',
  encrypted: true,
  enrolledAt: '2026-01-05T09:00:00.000',
  lastSyncAt: '2026-10-13T22:10:00.000',
  lastSeenAt: '2026-10-14T01:30:00.000',
  goneAt: null,
  matchedBy: 'serial',
  consoleUrl: 'https://intune.microsoft.com/#view/x/mdmDeviceId/abc',
};

const source = (overrides: Partial<SourceStatus> = {}): SourceStatus => ({
  key: 'intune',
  configured: true,
  running: false,
  lastRun: null,
  lastSuccessAt: null,
  counts: {
    devices: 0,
    linked: 0,
    unlinked: 0,
    ambiguous: 0,
    personal: 0,
    gone: 0,
  },
  ...overrides,
});

describe("a device's MDM group", () => {
  beforeEach(() => {
    state.managed = undefined;
  });

  it('is absent while no platform is connected', () => {
    state.managed = { data: [], connected: false };
    const { container } = render(<ManagedPlatforms deviceId='d1' />);
    expect(container).toBeEmptyDOMElement();
  });

  it('says so when the connected platforms do not know the device', () => {
    state.managed = { data: [], connected: true };
    render(<ManagedPlatforms deviceId='d1' />);
    expect(screen.getByText('deviceSync.group')).toBeInTheDocument();
    expect(screen.getByText('deviceSync.notFound')).toBeInTheDocument();
  });

  it('shows what the platform reports, the primary user linked, and where it opens', () => {
    state.managed = { data: [record], connected: true };
    render(
      <MemoryRouter>
        <ManagedPlatforms deviceId='d1' />
      </MemoryRouter>,
    );
    expect(screen.getByText('LAPTOP-01')).toBeInTheDocument();
    expect(screen.getByText('Windows 10.0.26100')).toBeInTheDocument();
    expect(screen.getByText('person:person-pat')).toBeInTheDocument();
    expect(
      screen.getByText('deviceSync.ownership.company'),
    ).toBeInTheDocument();
    expect(screen.getByText('common.yes')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /deviceSync\.openIn/ }),
    ).toHaveAttribute('href', record.consoleUrl);
  });
});

describe("a device's differences with the platform", () => {
  const check = (overrides: Partial<DeviceCheck>): DeviceCheck => ({
    kind: 'userMismatch',
    critical: false,
    deviceId: 'd1',
    deviceNo: 'DE-1',
    deviceName: 'Laptop',
    status: 'inUse',
    ownerId: 'mia',
    assigneeType: 'person',
    assigneeId: 'person-a',
    managedDeviceId: 'm1',
    source: 'intune',
    lastSyncAt: '2026-10-13T22:10:00.000',
    goneAt: null,
    personId: 'person-b',
    userName: 'Kim Ng',
    ...overrides,
  });
  const actions = {
    editable: true,
    onAssign: vi.fn(),
    onTransfer: vi.fn(),
    onRestore: vi.fn(),
  };

  beforeEach(() => {
    state.review.mockReset();
    actions.onTransfer.mockReset();
    actions.onAssign.mockReset();
  });

  it('offers to transfer to the platform user, or to keep the register', () => {
    state.managed = { data: [record], connected: true, checks: [check({})] };
    render(
      <MemoryRouter>
        <ManagedPlatforms deviceId='d1' actions={actions} />
      </MemoryRouter>,
    );
    expect(
      screen.getByText('deviceSync.checks.userSentence'),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'deviceSync.checks.transferTo' }),
    );
    expect(actions.onTransfer).toHaveBeenCalledWith('person-b');
    fireEvent.click(
      screen.getByRole('button', { name: 'deviceSync.checks.keepRegister' }),
    );
    expect(state.review).toHaveBeenCalledWith({
      kind: 'dismiss',
      deviceId: 'd1',
      check: 'userMismatch',
    });
    // And asks Noco about it, naming the device and the difference.
    fireEvent.click(
      screen.getByRole('button', { name: 'deviceSync.prompts.checkAction' }),
    );
    expect(state.ask).toHaveBeenCalledWith('deviceSync.prompts.check');
  });

  it('offers to assign a shelved device to whoever is using it', () => {
    state.managed = {
      data: [record],
      connected: true,
      checks: [check({ kind: 'statusMismatch', status: 'inStock' })],
    };
    render(
      <MemoryRouter>
        <ManagedPlatforms deviceId='d1' actions={actions} />
      </MemoryRouter>,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'deviceSync.checks.assignTo' }),
    );
    expect(actions.onAssign).toHaveBeenCalledWith('person-b');
  });

  it('offers nothing to a reader who may not change the device', () => {
    state.managed = { data: [record], connected: true, checks: [check({})] };
    render(
      <MemoryRouter>
        <ManagedPlatforms
          deviceId='d1'
          actions={{ ...actions, editable: false }}
        />
      </MemoryRouter>,
    );
    expect(
      screen.queryByRole('button', { name: 'deviceSync.checks.keepRegister' }),
    ).toBeNull();
    expect(screen.queryByText('deviceSync.unlink')).toBeNull();
  });
});

const renderCard = () =>
  render(
    <MemoryRouter>
      <DeviceSyncCard />
    </MemoryRouter>,
  );

describe('设置 → 设备同步', () => {
  beforeEach(() => {
    state.start.mockReset();
  });

  it('explains how to connect an unconfigured source and offers no sync', () => {
    state.status = [source({ configured: false })];
    renderCard();
    expect(
      screen.getByText('settings.deviceSync.notConfigured'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('settings.deviceSync.howTo.intune'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /settings\.deviceSync\.syncNow/ }),
    ).toBeDisabled();
  });

  it('shows the latest pull with its reason and counts, and starts a sync', () => {
    state.status = [
      source({
        lastRun: {
          id: 'r1',
          source: 'intune',
          trigger: 'manual',
          actorId: 'mia',
          status: 'failed',
          seen: 0,
          added: 0,
          linked: 0,
          gone: 0,
          failureCode: 'AUTH_FAILED',
          failure: 'Invalid client secret',
          startedAt: '2026-10-14T09:00:00.000',
          finishedAt: '2026-10-14T09:00:02.000',
        },
        lastSuccessAt: '2026-10-13T01:30:40.000',
        counts: {
          devices: 12,
          linked: 9,
          unlinked: 2,
          ambiguous: 0,
          personal: 1,
          gone: 0,
        },
      }),
    ];
    renderCard();
    expect(
      screen.getByText('settings.deviceSync.failures.AUTH_FAILED'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Invalid client secret/)).toBeInTheDocument();
    expect(
      screen.getByText('settings.deviceSync.lastSuccess'),
    ).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: /settings\.deviceSync\.syncNow/ }),
    );
    expect(state.start).toHaveBeenCalledTimes(1);
  });

  it('keeps only a line about the records an unconnected platform left', () => {
    state.status = [
      source({
        configured: false,
        lastRun: {
          id: 'r9',
          source: 'intune',
          trigger: 'manual',
          actorId: 'mia',
          status: 'failed',
          seen: 0,
          added: 0,
          linked: 0,
          gone: 0,
          failureCode: 'UNAVAILABLE',
          failure: 'fetch failed',
          startedAt: '2026-10-15T14:05:00.000',
          finishedAt: '2026-10-15T14:05:03.000',
        },
        lastSuccessAt: '2026-10-14T18:44:00.000',
        counts: {
          devices: 6,
          linked: 6,
          unlinked: 0,
          ambiguous: 0,
          personal: 0,
          gone: 0,
        },
      }),
    ];
    renderCard();
    expect(
      screen.getByText('settings.deviceSync.retained:6'),
    ).toBeInTheDocument();
    // Nothing can sync, so no run and no failure is reported, nor tiles.
    expect(
      screen.queryByText('settings.deviceSync.failures.UNAVAILABLE'),
    ).toBeNull();
    expect(screen.queryByText('settings.deviceSync.counts.devices')).toBeNull();
  });

  it('holds the button while a pull runs', () => {
    state.status = [source({ running: true })];
    renderCard();
    expect(
      screen.getByRole('button', { name: /settings\.deviceSync\.running/ }),
    ).toBeDisabled();
  });
});

describe('设置 → 设备同步: a connection entered on the page', () => {
  const connection = (
    overrides: Partial<DeviceConnection> = {},
  ): DeviceConnection => ({
    source: 'intune',
    origin: null,
    tenantId: null,
    url: null,
    clientId: null,
    updatedAt: null,
    updatedById: null,
    ...overrides,
  });
  beforeEach(() => {
    state.status = [source({ configured: false })];
    state.secretsReady = true;
    state.testResult = undefined;
    for (const spy of [state.save, state.remove, state.test]) spy.mockReset();
  });
  const type = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });

  it('connects Intune: tests what was typed, then saves it', () => {
    state.connections = [connection()];
    state.testResult = { ok: true, devices: 3 };
    renderCard();
    fireEvent.click(
      screen.getByRole('button', {
        name: /settings\.deviceSync\.connection\.connect/,
      }),
    );
    const dialog = screen.getByRole('dialog');
    // Intune asks for its tenant, not an address.
    expect(
      within(dialog).queryByLabelText(
        'settings.deviceSync.connection.fields.url',
      ),
    ).toBeNull();
    type('settings.deviceSync.connection.fields.tenantId', 'tenant-1');
    type('settings.deviceSync.connection.fields.clientId', 'client-1');
    type('settings.deviceSync.connection.fields.clientSecret', 's3cret');
    expect(
      within(dialog).getByLabelText(
        'settings.deviceSync.connection.fields.clientSecret',
      ),
    ).toHaveAttribute('type', 'password');
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'settings.deviceSync.connection.test',
      }),
    );
    const values = {
      tenantId: 'tenant-1',
      clientId: 'client-1',
      clientSecret: 's3cret',
    };
    expect(state.test).toHaveBeenCalledWith({ source: 'intune', values });
    expect(
      within(dialog).getByText('settings.deviceSync.connection.testOk:3'),
    ).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'settings.deviceSync.connection.save',
      }),
    );
    expect(state.save).toHaveBeenCalledWith({ source: 'intune', values });
  });

  it('keeps the stored secret when it is left empty, and disconnects', () => {
    state.connections = [
      connection({
        origin: 'settings',
        tenantId: 'tenant-1',
        clientId: 'client-1',
        updatedAt: '2026-10-15T10:00:00.000Z',
        updatedById: 'mia',
      }),
    ];
    renderCard();
    expect(
      screen.getByText('settings.deviceSync.connection.saved'),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', {
        name: /settings\.deviceSync\.connection\.edit/,
      }),
    );
    const dialog = screen.getByRole('dialog');
    // The secret is never sent to the page, so the field starts empty.
    expect(
      within(dialog).getByLabelText(
        'settings.deviceSync.connection.fields.clientSecret',
      ),
    ).toHaveValue('');
    expect(
      within(dialog).getByLabelText(
        'settings.deviceSync.connection.fields.tenantId',
      ),
    ).toHaveValue('tenant-1');
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'settings.deviceSync.connection.save',
      }),
    );
    expect(state.save).toHaveBeenCalledWith({
      source: 'intune',
      values: { tenantId: 'tenant-1', clientId: 'client-1' },
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: /settings\.deviceSync\.connection\.disconnect/,
      }),
    );
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'settings.deviceSync.connection.disconnect',
      }),
    );
    expect(state.remove).toHaveBeenCalledWith('intune');
  });

  it('shows a connection from config.yml read-only', () => {
    state.status = [source({ configured: true })];
    state.connections = [
      connection({ origin: 'config', tenantId: 't', clientId: 'c' }),
    ];
    renderCard();
    expect(
      screen.getByText('settings.deviceSync.connection.fromConfig'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: /settings\.deviceSync\.connection\./,
      }),
    ).toBeNull();
  });

  it('says why nothing can be stored without the secrets keys', () => {
    state.connections = [connection()];
    state.secretsReady = false;
    renderCard();
    expect(
      screen.getByText('settings.deviceSync.connection.secretsMissing'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /settings\.deviceSync\.connection\.connect/,
      }),
    ).toBeDisabled();
  });

  it('names a refused sign-in from the test', () => {
    state.connections = [connection({ source: 'intune' })];
    state.testResult = {
      ok: false,
      failureCode: 'AUTH_FAILED',
      failure: 'AADSTS7000215: Invalid client secret',
    };
    renderCard();
    fireEvent.click(
      screen.getByRole('button', {
        name: /settings\.deviceSync\.connection\.connect/,
      }),
    );
    expect(
      screen.getByText('settings.deviceSync.failures.AUTH_FAILED'),
    ).toBeInTheDocument();
    expect(screen.getByText(/AADSTS7000215/)).toBeInTheDocument();
  });
});

describe("a leaver's 归属 tab", () => {
  it('names the devices still online after they left, and nothing otherwise', () => {
    state.online = [];
    const { container, rerender } = render(
      <MemoryRouter>
        <LeaverOnlineDevices personId='p1' left />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
    state.online = [
      {
        id: 'm1',
        source: 'intune',
        deviceId: 'd1',
        deviceName: 'LAPTOP-LOU',
        serialNo: 'S1',
        lastSyncAt: '2026-10-13T08:00:00.000',
      },
      {
        id: 'm2',
        source: 'jamf',
        deviceId: null,
        deviceName: null,
        serialNo: 'S2',
        lastSyncAt: '2026-10-12T08:00:00.000',
      },
    ];
    rerender(
      <MemoryRouter>
        <LeaverOnlineDevices personId='p1' left />
      </MemoryRouter>,
    );
    expect(
      screen.getByText('deviceSync.onlineAfterLeaving:2'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'LAPTOP-LOU' })).toHaveAttribute(
      'href',
      '/devices/d1',
    );
    expect(screen.getByText('S2')).toBeInTheDocument();
    expect(screen.getByText('deviceSync.notOnRegister')).toBeInTheDocument();
  });
});
