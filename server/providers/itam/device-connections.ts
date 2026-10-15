import type { DatabaseManager } from '@nocobase/db';
import {
  createSecretsTableStore,
  type SecretsService,
  type SecretsStore,
} from '@nocobase/app-server/secrets';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type {
  DeviceSyncConfig,
  IntuneSourceConfig,
  JamfSourceConfig,
} from '../../config/device-sync.js';
import {
  configuredSources,
  DEVICE_SOURCES,
  type DeviceSourceKey,
  type HttpOptions,
} from './device-sources.js';
import { BusinessRuleError } from './errors.js';
import type { HistoryService } from './history.js';

/**
 * A platform's connection entered on 设置 → MDM (2026-10-15), for a
 * deployment whose operator does not edit `config.yml` — a hosted one, or
 * an IT team without access to the server. The client secret is sealed with
 * the deployment's `secrets.keys` and never leaves the server again: the
 * page learns only that one is set. The credential stays on the machine
 * that runs the application (NocoSolution guideline 1.5), in its own
 * database instead of its configuration file.
 *
 * `config.yml` wins for a platform it configures: the page then shows that
 * connection read-only, so a deployment configured by file behaves as
 * before.
 */

/** What the sealed secret is bound to; a copy in another row does not open. */
export const CLIENT_SECRET_PURPOSE = 'itam/device-sync-client-secret';
const aad = (source: string): string[] => [source];

/** The sealed column, for `secrets status` and `secrets rotate`. */
export function createDeviceConnectionsSecretsStore(
  connection: Parameters<typeof createSecretsTableStore>[0]['connection'],
): SecretsStore {
  return createSecretsTableStore({
    name: 'itam/device-sync-connections',
    table: 'deviceSyncConnections',
    key: 'source',
    columns: [
      {
        column: 'clientSecretSealed',
        purpose: CLIENT_SECRET_PURPOSE,
        aad: (row) => aad(String(row.source)),
      },
    ],
    connection,
  });
}

export type ConnectionOrigin = 'config' | 'settings';

/** A platform's connection as the page shows it: never the secret. */
export interface ConnectionView {
  readonly source: DeviceSourceKey;
  /** Where the connection comes from; null when the platform has none. */
  readonly origin: ConnectionOrigin | null;
  readonly tenantId: string | null;
  readonly url: string | null;
  readonly clientId: string | null;
  /** Saved on the page: when, and by whom. */
  readonly updatedAt: string | null;
  readonly updatedById: string | null;
}

export interface ConnectionInput {
  readonly tenantId?: string;
  readonly url?: string;
  readonly clientId?: string;
  /** Left out when saving again keeps the secret already stored. */
  readonly clientSecret?: string;
}

export interface ConnectionTestResult {
  /** The devices on the first page read, the most a test reads. */
  readonly devices: number;
}

export interface DeviceConnectionsService {
  /** Whether `secrets.keys` lets a secret be stored at all. */
  secretsReady(): boolean;
  describe(): Promise<ConnectionView[]>;
  /** The connections a pull uses: `config.yml`'s, then the page's. */
  effective(): Promise<DeviceSyncConfig>;
  save(
    source: DeviceSourceKey,
    input: ConnectionInput,
    actorId?: string,
  ): Promise<ConnectionView>;
  remove(source: DeviceSourceKey, actorId?: string): Promise<void>;
  /**
   * Signs in and reads one page of devices with `input`, completed by what
   * is stored, writing nothing. Throws the connector's `SourceError`.
   */
  test(
    source: DeviceSourceKey,
    input: ConnectionInput,
  ): Promise<ConnectionTestResult>;
}

export const deviceConnectionsServiceToken: ServiceToken<DeviceConnectionsService> =
  createServiceToken<DeviceConnectionsService>(
    'itam/device-connections-service',
  );

interface Row {
  readonly source: string;
  readonly tenantId: string | null;
  readonly url: string | null;
  readonly clientId: string;
  readonly clientSecretSealed: string;
  readonly updatedById: string | null;
  readonly updatedAt: unknown;
}

const trimmed = (value: string | null | undefined): string =>
  (value ?? '').trim();

/** Every value `config.yml` needs for the platform, as its validator asks. */
function complete(
  source: DeviceSourceKey,
  values: IntuneSourceConfig | JamfSourceConfig | undefined,
): boolean {
  if (!values) return false;
  const fields =
    source === 'intune'
      ? (['tenantId', 'clientId', 'clientSecret'] as const)
      : (['url', 'clientId', 'clientSecret'] as const);
  return fields.every((field) =>
    Boolean(trimmed((values as Record<string, string | undefined>)[field])),
  );
}

const iso = (value: unknown): string | null =>
  value instanceof Date
    ? value.toISOString()
    : typeof value === 'string' && value
      ? value
      : null;

export function createDeviceConnectionsService(deps: {
  readonly database: DatabaseManager;
  readonly history: HistoryService;
  /** `config.yml`'s `deviceSync` section. */
  readonly config: () => DeviceSyncConfig | undefined;
  /** The deployment's secrets service; absent in a bare container. */
  readonly secrets: () => SecretsService | undefined;
  /** Replaced in tests. */
  readonly http?: HttpOptions;
}): DeviceConnectionsService {
  const { database } = deps;

  const rows = async (): Promise<Map<string, Row>> =>
    new Map(
      (
        await database
          .query()
          .selectFrom('deviceSyncConnections')
          .selectAll()
          .execute<Row>()
      ).map((row) => [row.source, row]),
    );

  const ready = (): SecretsService | null => {
    const secrets = deps.secrets();
    return secrets?.ready ? secrets : null;
  };

  /** The page's connection with its secret opened, or undefined. */
  const opened = (
    row: Row | undefined,
  ): (IntuneSourceConfig & JamfSourceConfig) | undefined => {
    const secrets = ready();
    if (!row || !secrets) return undefined;
    try {
      return {
        tenantId: row.tenantId ?? undefined,
        url: row.url ?? undefined,
        clientId: row.clientId,
        clientSecret: secrets.open(row.clientSecretSealed, {
          purpose: CLIENT_SECRET_PURPOSE,
          aad: aad(row.source),
        }),
      };
    } catch {
      // Sealed with a key no longer configured: as good as not connected,
      // and the page says to enter the secret again.
      return undefined;
    }
  };

  /** `config.yml`'s connection of the platform, when it is complete. */
  const fromConfig = (
    source: DeviceSourceKey,
  ): (IntuneSourceConfig & JamfSourceConfig) | undefined => {
    const values: (IntuneSourceConfig & JamfSourceConfig) | undefined =
      deps.config()?.[source];
    return complete(source, values) ? values : undefined;
  };

  const view = (source: DeviceSourceKey, row?: Row): ConnectionView => {
    const configured = fromConfig(source);
    if (configured)
      return {
        source,
        origin: 'config',
        tenantId: trimmed(configured.tenantId) || null,
        url: trimmed(configured.url) || null,
        clientId: trimmed(configured.clientId) || null,
        updatedAt: null,
        updatedById: null,
      };
    return {
      source,
      origin: row ? 'settings' : null,
      tenantId: row?.tenantId ?? null,
      url: row?.url ?? null,
      clientId: row?.clientId ?? null,
      updatedAt: iso(row?.updatedAt),
      updatedById: row?.updatedById ?? null,
    };
  };

  /** The values a test or a save works with: the input over what is stored. */
  const merged = (
    source: DeviceSourceKey,
    input: ConnectionInput,
    row: Row | undefined,
  ) => {
    const stored = opened(row);
    const values = {
      tenantId: trimmed(input.tenantId ?? stored?.tenantId),
      url: trimmed(input.url ?? stored?.url).replace(/\/+$/, ''),
      clientId: trimmed(input.clientId ?? stored?.clientId),
      clientSecret:
        trimmed(input.clientSecret) || trimmed(stored?.clientSecret),
    };
    if (source === 'intune' && !values.tenantId)
      throw new BusinessRuleError(
        'The tenant ID is required',
        'deviceSync.tenantRequired',
      );
    if (source === 'jamf' && !/^https:\/\/[^/\s]+/.test(values.url))
      throw new BusinessRuleError(
        'The Jamf Pro address must start with https://',
        'deviceSync.urlInvalid',
      );
    if (!values.clientId)
      throw new BusinessRuleError(
        'The client ID is required',
        'deviceSync.clientIdRequired',
      );
    if (!values.clientSecret)
      throw new BusinessRuleError(
        'The client secret is required',
        'deviceSync.secretRequired',
      );
    return values;
  };

  const refuseConfigured = (source: DeviceSourceKey) => {
    if (fromConfig(source))
      throw new BusinessRuleError(
        'This platform is connected in the server configuration file',
        'deviceSync.managedByConfig',
      );
  };

  return {
    secretsReady: () => ready() !== null,

    async describe() {
      const stored = await rows();
      return DEVICE_SOURCES.map((source) => view(source, stored.get(source)));
    },

    async effective() {
      const stored = await rows();
      const result: DeviceSyncConfig = {};
      for (const source of DEVICE_SOURCES) {
        const values = fromConfig(source) ?? opened(stored.get(source));
        if (values) (result as Record<string, unknown>)[source] = values;
      }
      return result;
    },

    async save(source, input, actorId) {
      refuseConfigured(source);
      const secrets = ready();
      if (!secrets)
        throw new BusinessRuleError(
          'The server has no secrets keys to store a secret with',
          'deviceSync.secretsNotConfigured',
        );
      const existing = (await rows()).get(source);
      const values = merged(source, input, existing);
      const now = new Date();
      const record = {
        tenantId: source === 'intune' ? values.tenantId : null,
        url: source === 'jamf' ? values.url : null,
        clientId: values.clientId,
        clientSecretSealed: secrets.seal(values.clientSecret, {
          purpose: CLIENT_SECRET_PURPOSE,
          aad: aad(source),
        }),
        updatedById: actorId ?? null,
        updatedAt: now,
      };
      if (existing)
        await database
          .query()
          .updateTable('deviceSyncConnections')
          .set(record)
          .where('source', '=', source)
          .execute();
      else
        await database
          .query()
          .insertInto('deviceSyncConnections')
          .values({ source, ...record, createdAt: now })
          .execute();
      // What changed, never the secret: only whether a new one was given.
      await deps.history.record({
        subjectType: 'deviceSyncConnections',
        subjectId: source,
        type: existing ? 'connectionUpdated' : 'connectionCreated',
        summary: existing
          ? `Updated the ${source} connection`
          : `Connected ${source}`,
        payload: {
          tenantId: record.tenantId,
          url: record.url,
          clientId: record.clientId,
          secretChanged: Boolean(trimmed(input.clientSecret)),
        },
        actorId,
      });
      return view(source, (await rows()).get(source));
    },

    async remove(source, actorId) {
      refuseConfigured(source);
      if (!(await rows()).has(source)) return;
      await database
        .query()
        .deleteFrom('deviceSyncConnections')
        .where('source', '=', source)
        .execute();
      await deps.history.record({
        subjectType: 'deviceSyncConnections',
        subjectId: source,
        type: 'connectionRemoved',
        summary: `Disconnected ${source}`,
        actorId,
      });
    },

    async test(source, input) {
      // A platform `config.yml` connects is tested as configured there.
      const values =
        fromConfig(source) ?? merged(source, input, (await rows()).get(source));
      const [connector] = configuredSources(
        { [source]: values },
        // One attempt: a person is waiting, and a retry's back-off would
        // only make them wait longer for the same answer.
        { ...deps.http, attempts: 1 },
      );
      if (!connector)
        throw new BusinessRuleError(
          'The connection is incomplete',
          'deviceSync.incomplete',
        );
      for await (const page of connector.pages())
        return { devices: page.length };
      return { devices: 0 };
    },
  };
}
