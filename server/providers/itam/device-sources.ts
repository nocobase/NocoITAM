import type {
  IntuneSourceConfig,
  JamfSourceConfig,
} from '../../config/device-sync.js';

/**
 * The device management platforms ITAM reads devices from (device sync,
 * 2026-10-14). A source only reads: nothing here writes to a platform, and
 * each asks only for the permission to read devices.
 */
export const DEVICE_SOURCES = ['intune', 'jamf'] as const;
export type DeviceSourceKey = (typeof DEVICE_SOURCES)[number];

/** One device as a platform reports it, before it meets the register. */
export interface ObservedDevice {
  readonly externalId: string;
  /** As the platform wrote it; `normalizeSerial` decides whether it matches. */
  readonly serialNo: string | null;
  readonly deviceName: string | null;
  readonly manufacturer: string | null;
  readonly model: string | null;
  readonly osName: string | null;
  readonly osVersion: string | null;
  /** The primary user's sign-in name or email, as the platform has it. */
  readonly userPrincipal: string | null;
  readonly userName: string | null;
  readonly ownership: 'company' | 'personal' | 'unknown';
  readonly compliance: string | null;
  readonly encrypted: boolean | null;
  readonly wifiMac: string | null;
  /** ISO timestamps, as the platform sent them. */
  readonly enrolledAt: string | null;
  readonly lastSyncAt: string | null;
  /** The platform's record, kept as the evidence behind every value above. */
  readonly raw: Readonly<Record<string, unknown>>;
}

/** A platform's devices, a page at a time. */
export interface DeviceSource {
  readonly key: DeviceSourceKey;
  pages(): AsyncIterable<readonly ObservedDevice[]>;
}

/**
 * Why a pull failed, as the settings page names it. Only `UNAVAILABLE` is
 * transient, and is retried before it surfaces; the others need a person to
 * change something on the platform or in `config.yml`.
 */
export type SourceFailureCode =
  | 'AUTH_FAILED'
  | 'PERMISSION_MISSING'
  | 'UNAVAILABLE'
  | 'INVALID_RESPONSE'
  | 'INTERRUPTED';

export class SourceError extends Error {
  constructor(
    readonly code: SourceFailureCode,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Serials a platform reports for a machine that has none of its own —
 * self-built PCs and virtual machines — compared upper-cased. Matching one
 * would tie every such machine to the same register device.
 */
const PLACEHOLDER_SERIALS: ReadonlySet<string> = new Set([
  'TO BE FILLED BY O.E.M.',
  'TO BE FILLED BY OEM',
  'DEFAULT STRING',
  'SYSTEM SERIAL NUMBER',
  'CHASSIS SERIAL NUMBER',
  'BASE BOARD SERIAL NUMBER',
  'NOT SPECIFIED',
  'NOT APPLICABLE',
  'NOT AVAILABLE',
  'NONE',
  'NULL',
  'N/A',
  'NA',
  'UNKNOWN',
  'INVALID',
  'OEM',
  'O.E.M.',
  '0123456789',
  '123456789',
  '1234567890',
]);

/**
 * The serial as matched: trimmed and upper-cased, or null when there is
 * none or it is a placeholder (including one made only of zeros, dashes and
 * spaces).
 */
export function normalizeSerial(
  value: string | null | undefined,
): string | null {
  const serial = (value ?? '').trim().toUpperCase();
  if (!serial) return null;
  if (PLACEHOLDER_SERIALS.has(serial)) return null;
  if (/^[0\s-]+$/.test(serial)) return null;
  return serial;
}

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface HttpOptions {
  readonly fetch?: Fetch;
  /** Waits between retries; replaced in tests. */
  readonly sleep?: (milliseconds: number) => Promise<void>;
  /** Attempts per request, the first included. */
  readonly attempts?: number;
}

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/**
 * One request, retried on what is transient — a network failure, 429 and
 * 5xx — honouring `Retry-After` (capped at a minute). Anything else is the
 * caller's to judge.
 */
export async function requestWithRetry(
  url: string,
  init: RequestInit,
  options: HttpOptions = {},
): Promise<Response> {
  const fetcher = options.fetch ?? ((input, request) => fetch(input, request));
  const sleep = options.sleep ?? wait;
  const attempts = Math.max(1, options.attempts ?? 3);
  let last: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let response: Response | undefined;
    try {
      response = await fetcher(url, init);
    } catch (error) {
      last = error;
    }
    if (response && response.status !== 429 && response.status < 500)
      return response;
    if (response) last = new Error(`HTTP ${response.status}`);
    if (attempt === attempts) break;
    const retryAfter = Number(response?.headers.get('retry-after'));
    await sleep(
      Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter, 60) * 1000
        : 1000 * 2 ** (attempt - 1),
    );
  }
  throw new SourceError(
    'UNAVAILABLE',
    last instanceof Error ? last.message : String(last),
  );
}

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const GRAPH = 'https://graph.microsoft.com/v1.0';

/** What the list asks Graph for: only what ITAM shows or matches on. */
const INTUNE_FIELDS = [
  'id',
  'deviceName',
  'serialNumber',
  'manufacturer',
  'model',
  'operatingSystem',
  'osVersion',
  'userPrincipalName',
  'emailAddress',
  'userDisplayName',
  'managedDeviceOwnerType',
  'complianceState',
  'isEncrypted',
  'wiFiMacAddress',
  'enrolledDateTime',
  'lastSyncDateTime',
] as const;

/** A Graph `managedDevice` as ITAM reads it. */
export function intuneDevice(record: Record<string, unknown>): ObservedDevice {
  const owner = record.managedDeviceOwnerType;
  return {
    externalId: String(record.id),
    serialNo: text(record.serialNumber),
    deviceName: text(record.deviceName),
    manufacturer: text(record.manufacturer),
    model: text(record.model),
    osName: text(record.operatingSystem),
    osVersion: text(record.osVersion),
    userPrincipal: text(record.userPrincipalName) ?? text(record.emailAddress),
    userName: text(record.userDisplayName),
    ownership: owner === 'company' || owner === 'personal' ? owner : 'unknown',
    compliance: text(record.complianceState),
    encrypted:
      typeof record.isEncrypted === 'boolean' ? record.isEncrypted : null,
    wifiMac: text(record.wiFiMacAddress),
    // Graph writes 0001-01-01 for "never".
    enrolledAt: realDate(record.enrolledDateTime),
    lastSyncAt: realDate(record.lastSyncDateTime),
    raw: record,
  };
}

function realDate(value: unknown): string | null {
  const date = text(value);
  return date && !date.startsWith('0001-') ? date : null;
}

/**
 * Microsoft Intune, read through Microsoft Graph with the client
 * credentials of an Entra ID app registration that holds the application
 * permission `DeviceManagementManagedDevices.Read.All`.
 */
export function createIntuneSource(
  config: Required<IntuneSourceConfig>,
  options: HttpOptions = {},
): DeviceSource {
  const token = async (): Promise<string> => {
    const response = await requestWithRetry(
      `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          scope: 'https://graph.microsoft.com/.default',
          grant_type: 'client_credentials',
        }).toString(),
      },
      options,
    );
    const body = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!response.ok || typeof body.access_token !== 'string')
      // A wrong tenant, client or secret all answer 400 / 401 here.
      throw new SourceError(
        'AUTH_FAILED',
        text(body.error_description)?.split('\n')[0] ??
          `Sign-in to Entra ID answered ${response.status}`,
      );
    return body.access_token;
  };

  return {
    key: 'intune',
    async *pages() {
      const bearer = await token();
      let next: string | null =
        `${GRAPH}/deviceManagement/managedDevices?$select=${INTUNE_FIELDS.join(',')}`;
      while (next) {
        const response = await requestWithRetry(
          next,
          { headers: { authorization: `Bearer ${bearer}` } },
          options,
        );
        const body = (await response.json().catch(() => undefined)) as
          Record<string, unknown> | undefined;
        if (response.status === 401)
          throw new SourceError('AUTH_FAILED', graphError(body, 401));
        if (response.status === 403)
          throw new SourceError('PERMISSION_MISSING', graphError(body, 403));
        if (!response.ok)
          throw new SourceError(
            'UNAVAILABLE',
            graphError(body, response.status),
          );
        if (!body || !Array.isArray(body.value))
          throw new SourceError(
            'INVALID_RESPONSE',
            'Graph answered without a device list',
          );
        yield (body.value as Record<string, unknown>[])
          .filter((record) => typeof record.id === 'string')
          .map(intuneDevice);
        next =
          typeof body['@odata.nextLink'] === 'string'
            ? body['@odata.nextLink']
            : null;
      }
    },
  };
}

function graphError(
  body: Record<string, unknown> | undefined,
  status: number,
): string {
  const error = body?.error as { message?: unknown } | undefined;
  return text(error?.message) ?? `Microsoft Graph answered ${status}`;
}

/** Jamf's records are of two kinds, numbered apart: keep their ids apart. */
const JAMF_COMPUTER = 'computer:';
const JAMF_MOBILE = 'mobile:';

/**
 * A Jamf Pro computer (`/api/v4/computers-inventory`, or v3 / v1 on an older
 * Jamf Pro; the record is the same but for v4's `lastContact`) as ITAM
 * reads it.
 */
export function jamfComputer(record: Record<string, unknown>): ObservedDevice {
  const general = (record.general ?? {}) as Record<string, unknown>;
  const hardware = (record.hardware ?? {}) as Record<string, unknown>;
  const system = (record.operatingSystem ?? {}) as Record<string, unknown>;
  const user = (record.userAndLocation ?? {}) as Record<string, unknown>;
  const fileVault = text(system.fileVault2Status);
  return {
    externalId: `${JAMF_COMPUTER}${String(record.id)}`,
    serialNo: text(hardware.serialNumber),
    deviceName: text(general.name),
    manufacturer: text(hardware.make) ?? 'Apple',
    model: text(hardware.model),
    osName: text(system.name) ?? 'macOS',
    osVersion: text(system.version),
    userPrincipal: text(user.email) ?? text(user.username),
    userName: text(user.realname),
    // Jamf records no owner type for a computer: a Mac it manages is the
    // company's.
    ownership: 'company',
    compliance: null,
    encrypted:
      fileVault === 'ALL_ENCRYPTED' || fileVault === 'BOOT_ENCRYPTED'
        ? true
        : fileVault === 'NOT_ENCRYPTED'
          ? false
          : null,
    wifiMac: text(hardware.macAddress),
    enrolledAt: text(general.lastEnrolledDate),
    lastSyncAt:
      text(general.lastContact) ??
      text(general.lastContactTime) ??
      text(general.reportDate),
    raw: record,
  };
}

/** A Jamf Pro iPhone or iPad (`/api/v2/mobile-devices/detail`). */
export function jamfMobile(record: Record<string, unknown>): ObservedDevice {
  const general = (record.general ?? {}) as Record<string, unknown>;
  const hardware = (record.hardware ?? {}) as Record<string, unknown>;
  const user = (record.userAndLocation ?? {}) as Record<string, unknown>;
  const security = (record.security ?? {}) as Record<string, unknown>;
  const owner = text(general.deviceOwnershipType)?.toLowerCase() ?? '';
  return {
    externalId: `${JAMF_MOBILE}${String(record.mobileDeviceId)}`,
    serialNo: text(hardware.serialNumber),
    deviceName: text(general.displayName),
    manufacturer: 'Apple',
    model: text(hardware.model),
    osName: text(record.deviceType) ?? 'iOS',
    osVersion: text(general.osVersion),
    userPrincipal: text(user.emailAddress) ?? text(user.username),
    userName: text(user.realName),
    // Institutional, or a person's own device enrolled for work.
    ownership:
      owner.includes('personal') || owner.includes('userenrollment')
        ? 'personal'
        : owner
          ? 'company'
          : 'unknown',
    compliance: null,
    encrypted:
      typeof security.dataProtected === 'boolean'
        ? security.dataProtected
        : null,
    wifiMac: text(hardware.wifiMacAddress),
    enrolledAt: text(general.lastEnrolledDate),
    // A mobile device's inventory is the platform's latest word on it.
    lastSyncAt: text(general.lastInventoryUpdateDate),
    raw: record,
  };
}

/**
 * Jamf Pro, read through its API with the client credentials of an API
 * client (Jamf Pro 10.49+): the computers, then the iPhones and iPads, a
 * page at a time.
 */
export function createJamfSource(
  config: Required<JamfSourceConfig>,
  options: HttpOptions & { readonly pageSize?: number } = {},
): DeviceSource {
  const base = config.url.replace(/\/+$/, '');
  const pageSize = options.pageSize ?? 200;
  const token = async (): Promise<string> => {
    const response = await requestWithRetry(
      `${base}/api/oauth/token`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          grant_type: 'client_credentials',
        }).toString(),
      },
      options,
    );
    const body = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!response.ok || typeof body.access_token !== 'string')
      throw new SourceError(
        'AUTH_FAILED',
        text(body.error_description) ??
          text(body.error) ??
          `Sign-in to Jamf Pro answered ${response.status}`,
      );
    return body.access_token;
  };

  /**
   * One endpoint, every page, mapped. `paths` are tried in order while the
   * first page answers 404, for an endpoint a newer Jamf Pro replaced.
   */
  async function* list(
    bearer: string,
    paths: readonly string[],
    sections: readonly string[],
    sort: string,
    map: (record: Record<string, unknown>) => ObservedDevice,
  ): AsyncGenerator<readonly ObservedDevice[]> {
    let tried = 0;
    for (let page = 0; ; page++) {
      const query = new URLSearchParams();
      for (const section of sections) query.append('section', section);
      query.set('page', String(page));
      query.set('page-size', String(pageSize));
      query.set('sort', sort);
      const response = await requestWithRetry(
        `${base}${paths[tried]}?${query.toString()}`,
        { headers: { authorization: `Bearer ${bearer}` } },
        options,
      );
      const body = (await response.json().catch(() => undefined)) as
        Record<string, unknown> | undefined;
      if (response.status === 404 && page === 0 && tried < paths.length - 1) {
        tried++;
        page--;
        continue;
      }
      if (response.status === 401)
        throw new SourceError('AUTH_FAILED', jamfError(body, 401));
      if (response.status === 403)
        throw new SourceError('PERMISSION_MISSING', jamfError(body, 403));
      if (!response.ok)
        throw new SourceError('UNAVAILABLE', jamfError(body, response.status));
      if (!body || !Array.isArray(body.results))
        throw new SourceError(
          'INVALID_RESPONSE',
          'Jamf Pro answered without a device list',
        );
      const results = body.results as Record<string, unknown>[];
      yield results.map(map);
      const total = Number(body.totalCount);
      if (
        results.length < pageSize ||
        (Number.isFinite(total) && (page + 1) * pageSize >= total)
      )
        return;
    }
  }

  return {
    key: 'jamf',
    async *pages() {
      const bearer = await token();
      // Jamf deprecated v1 of the computer inventory on 2025-06-30 for v3,
      // and v3 on 2026-07-14 for v4 (Jamf Pro 11.30); a Jamf Pro too old
      // for a version answers it with 404, so the newest is tried first.
      yield* list(
        bearer,
        [
          '/api/v4/computers-inventory',
          '/api/v3/computers-inventory',
          '/api/v1/computers-inventory',
        ],
        ['GENERAL', 'HARDWARE', 'OPERATING_SYSTEM', 'USER_AND_LOCATION'],
        'id:asc',
        jamfComputer,
      );
      // The mobile inventory sorts by `mobileDeviceId`; it has no `id`.
      yield* list(
        bearer,
        ['/api/v2/mobile-devices/detail'],
        ['GENERAL', 'HARDWARE', 'USER_AND_LOCATION', 'SECURITY'],
        'mobileDeviceId:asc',
        jamfMobile,
      );
    },
  };
}

function jamfError(
  body: Record<string, unknown> | undefined,
  status: number,
): string {
  const errors = body?.errors as { description?: unknown }[] | undefined;
  return text(errors?.[0]?.description) ?? `Jamf Pro answered ${status}`;
}

/**
 * Where a platform's own page for one of its records is. The demo's records
 * have none: their ids are made up (2026-10-15).
 */
export function consoleUrl(
  source: string,
  externalId: string,
  config?: { readonly jamf?: JamfSourceConfig },
): string | null {
  if (externalId.startsWith('demo-') || externalId.includes(':demo-'))
    return null;
  if (source === 'intune')
    return `https://intune.microsoft.com/#view/Microsoft_Intune_Devices/DeviceSettingsMenuBlade/~/overview/mdmDeviceId/${encodeURIComponent(externalId)}`;
  const jamf = config?.jamf?.url?.trim().replace(/\/+$/, '');
  if (source === 'jamf' && jamf) {
    if (externalId.startsWith(JAMF_COMPUTER))
      return `${jamf}/computers.html?id=${encodeURIComponent(externalId.slice(JAMF_COMPUTER.length))}&o=r`;
    if (externalId.startsWith(JAMF_MOBILE))
      return `${jamf}/mobileDevices.html?id=${encodeURIComponent(externalId.slice(JAMF_MOBILE.length))}&o=r`;
  }
  return null;
}

/** The sources `config.yml` fully configures, ready to read. */
export function configuredSources(
  config:
    | {
        readonly intune?: IntuneSourceConfig;
        readonly jamf?: JamfSourceConfig;
      }
    | undefined,
  options: HttpOptions = {},
): DeviceSource[] {
  const sources: DeviceSource[] = [];
  const intune = config?.intune;
  if (
    intune?.tenantId?.trim() &&
    intune.clientId?.trim() &&
    intune.clientSecret?.trim()
  )
    sources.push(
      createIntuneSource(
        {
          tenantId: intune.tenantId.trim(),
          clientId: intune.clientId.trim(),
          clientSecret: intune.clientSecret.trim(),
        },
        options,
      ),
    );
  const jamf = config?.jamf;
  if (jamf?.url?.trim() && jamf.clientId?.trim() && jamf.clientSecret?.trim())
    sources.push(
      createJamfSource(
        {
          url: jamf.url.trim(),
          clientId: jamf.clientId.trim(),
          clientSecret: jamf.clientSecret.trim(),
        },
        options,
      ),
    );
  return sources;
}
