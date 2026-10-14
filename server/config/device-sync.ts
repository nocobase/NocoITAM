import {
  defineAppConfig,
  envString,
  type AppConfigFactory,
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

export interface DeviceSyncConfig {
  /** Absent or empty: Intune is not connected. */
  intune?: IntuneSourceConfig;
}

const INTUNE_FIELDS = ['tenantId', 'clientId', 'clientSecret'] as const;

/**
 * Application section (2026-10-14, device sync step 1): the device management
 * platforms ITAM reads its devices from. Credentials stay here, on the
 * machine that runs the application (NocoSolution guideline 1.5); the
 * settings page only says whether a source is configured. A secret is written
 * as the value itself — a `${NAME}` placeholder is not expanded — or set
 * from the environment variables below.
 */
const deviceSync: AppConfigFactory<DeviceSyncConfig> =
  defineAppConfig<DeviceSyncConfig>({
    env: {
      INTUNE_TENANT_ID: envString('intune.tenantId', {
        description: 'The Entra ID tenant whose Intune devices ITAM reads.',
      }),
      INTUNE_CLIENT_ID: envString('intune.clientId', {
        description: 'The Entra ID app registration ITAM reads Intune with.',
      }),
      INTUNE_CLIENT_SECRET: envString('intune.clientSecret', {
        description: "The app registration's client secret.",
        secret: true,
      }),
    },
    defaults: {},
    validate(value, context) {
      const intune = value.intune;
      if (!intune) return;
      const filled = INTUNE_FIELDS.filter((field) =>
        Boolean(intune[field]?.trim()),
      );
      // All three, or none: a half-configured source would fail every night.
      if (filled.length > 0 && filled.length < INTUNE_FIELDS.length)
        for (const field of INTUNE_FIELDS)
          if (!filled.includes(field))
            context.error(
              `intune.${field}`,
              'is required when Intune is configured.',
            );
      for (const field of INTUNE_FIELDS)
        if (intune[field]?.includes('${'))
          context.error(
            `intune.${field}`,
            'holds a ${NAME} placeholder, which is not expanded; write the value itself.',
          );
    },
  });

export default deviceSync;
