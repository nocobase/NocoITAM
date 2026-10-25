import { demoModeRoutes } from '@nocobase/app-plugin-demo-mode/client';

/** The settings tab and its route share the deployment's published flag. */
export const demoManagementRoutes = demoModeRoutes([
  {
    name: 'itam-settings-demo',
    path: 'demo',
    authz: {
      resource: { type: 'settings', id: 'demoMode.data' },
      action: 'read',
    },
    componentLoader: () => import('../../pages/itam/settings/demo.js'),
  },
]);

// Ordinary installations retain ITAM's existing sample importer at the same URL.
// Only the dedicated management route uses the plugin's settings permissions.
export const demoSettingsRoutes = demoManagementRoutes.length
  ? demoManagementRoutes
  : [
      {
        name: 'itam-settings-sample-data',
        path: 'demo',
        authz: {
          resource: { type: 'page' as const, id: 'itam-settings' },
          action: 'access',
        },
        componentLoader: () => import('../../pages/itam/settings/demo.js'),
      },
    ];
