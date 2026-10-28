import {
  defineAppConfig,
  envString,
  type AppConfigFactory,
  type ConfigValidationContext,
} from '@nocobase/app-server/config';

/**
 * A Microsoft Intune tenant read through Microsoft Graph: an app registration
 * in Entra ID with the application permission
 * `DeviceManagementManagedDevices.Read.All`, consented by an administrator.
 */
export interface IntuneSourceConfig {
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
}

/**
 * A Jamf Pro server (step 3, 2026-10-15): an API client whose role holds
 * only the read privileges for computers and mobile devices (Read Computers,
 * Read Mobile Devices). Jamf Pro 10.49 or later.
 */
export interface JamfSourceConfig {
  /** The server's address, e.g. https://example.jamfcloud.com. */
  url?: string;
  clientId?: string;
  clientSecret?: string;
}

export interface DeviceSyncConfig {
  /** Absent or empty: Intune is not connected. */
  intune?: IntuneSourceConfig;
  /** Absent or empty: Jamf Pro is not connected. */
  jamf?: JamfSourceConfig;
}

const INTUNE_FIELDS = ['tenantId', 'clientId', 'clientSecret'] as const;
const JAMF_FIELDS = ['url', 'clientId', 'clientSecret'] as const;

/** All of a source's values, or none: a half-configured one fails nightly. */
function checkSource<K extends string>(
  name: string,
  values: Partial<Record<K, string>> | undefined,
  fields: readonly K[],
  context: ConfigValidationContext,
): void {
  if (!values) return;
  const filled = fields.filter((field) => Boolean(values[field]?.trim()));
  if (filled.length > 0 && filled.length < fields.length)
    for (const field of fields)
      if (!filled.includes(field))
        context.error(
          `${name}.${field}`,
          `is required when ${name} is configured.`,
        );
  for (const field of fields)
    if (values[field]?.includes('${'))
      context.error(
        `${name}.${field}`,
        'holds a ${NAME} placeholder, which is not expanded; write the value itself.',
      );
}

/**
 * Application section (2026-10-14, device sync step 1; Jamf in step 3): the
 * device management platforms ITAM reads its devices from. A platform set
 * here wins, and the settings page shows it read-only; one left out can be
 * connected on 设置 → 设备同步 instead (2026-10-15,
 * `providers/itam/device-connections.ts`), its secret sealed with
 * `secrets.keys`. Either way the credential stays on the machine that runs
 * the application. A secret is written as the
 * value itself — a `${NAME}` placeholder is not expanded — or set from the
 * environment variables below. None of them is required (2026-10-16): with
 * no code default and nothing in `config.example.yml`, the build's
 * `variables.json` listed all six as required, and a deployment platform
 * refused to start the application until they were set.
 */
const deviceSync: AppConfigFactory<DeviceSyncConfig> =
  defineAppConfig<DeviceSyncConfig>({
    env: {
      INTUNE_TENANT_ID: envString('intune.tenantId', {
        description: 'The Entra ID tenant whose Intune devices ITAM reads.',
        required: false,
      }),
      INTUNE_CLIENT_ID: envString('intune.clientId', {
        description: 'The Entra ID app registration ITAM reads Intune with.',
        required: false,
      }),
      INTUNE_CLIENT_SECRET: envString('intune.clientSecret', {
        description: "The app registration's client secret.",
        secret: true,
        required: false,
      }),
      JAMF_URL: envString('jamf.url', {
        description: 'The Jamf Pro server ITAM reads devices from.',
        required: false,
      }),
      JAMF_CLIENT_ID: envString('jamf.clientId', {
        description: 'The Jamf Pro API client ITAM reads with.',
        required: false,
      }),
      JAMF_CLIENT_SECRET: envString('jamf.clientSecret', {
        description: "The Jamf Pro API client's secret.",
        secret: true,
        required: false,
      }),
    },
    defaults: {},
    validate(value, context) {
      checkSource('intune', value.intune, INTUNE_FIELDS, context);
      checkSource('jamf', value.jamf, JAMF_FIELDS, context);
      const url = value.jamf?.url?.trim();
      if (url && !url.includes('${') && !/^https:\/\/[^/\s]+/.test(url))
        context.error(
          'jamf.url',
          'must be the https:// address of the server.',
        );
    },
  });

export default deviceSync;
