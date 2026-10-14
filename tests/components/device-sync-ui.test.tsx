import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ManagedPlatforms } from '../../client/components/itam/managed-platforms.js';
import { DeviceSyncCard } from '../../client/pages/itam/settings/device-sync-card.js';
import type {
  ManagedDevice,
  SourceStatus,
} from '../../client/lib/itam/device-sync.js';

const state = vi.hoisted(() => ({
  managed: undefined as
    { data: ManagedDevice[]; connected: boolean } | undefined,
  status: [] as SourceStatus[],
  start: vi.fn(),
}));

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
  useStartDeviceSync: () => ({
    mutate: state.start,
    isPending: false,
    error: null,
  }),
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

describe("a device's 管理平台 group", () => {
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

describe('设置 → 设备同步', () => {
  beforeEach(() => {
    state.start.mockReset();
  });

  it('explains how to connect an unconfigured source and offers no sync', () => {
    state.status = [source({ configured: false })];
    render(<DeviceSyncCard />);
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
    render(<DeviceSyncCard />);
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

  it('holds the button while a pull runs', () => {
    state.status = [source({ running: true })];
    render(<DeviceSyncCard />);
    expect(
      screen.getByRole('button', { name: /settings\.deviceSync\.running/ }),
    ).toBeDisabled();
  });
});
