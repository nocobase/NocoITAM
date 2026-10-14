import type { IntuneSourceConfig } from '../../config/device-sync.js';

/**
 * The device management platforms ITAM reads devices from (device sync,
 * 2026-10-14). A source only reads: nothing here writes to a platform, and
 * each asks only for the permission to read devices.
 */
export const DEVICE_SOURCES = ['intune'] as const;
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

/** The sources `config.yml` fully configures, ready to read. */
export function configuredSources(
  config: { readonly intune?: IntuneSourceConfig } | undefined,
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
  return sources;
}
