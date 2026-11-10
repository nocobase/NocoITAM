import { demoModeRoutes } from '@nocobase/app-plugin-demo-mode/client';
import { Database } from 'lucide-react';

/**
 * 演示数据's card in 业务配置 on the settings home (template 1.0.0-beta.92,
 * 2026-11-10); the same name, address and grant it had as a settings tab.
 */
const card = {
  parent: 'settingsBusiness',
  path: '/demo',
  auth: 'required',
  navigation: {
    title: 'settings.demo.title',
    description: 'settings.demo.cardDescription',
    icon: Database,
  },
  breadcrumb: { title: 'settings.demo.title' },
  componentLoader: () => import('../../pages/itam/settings/demo.js'),
} as const;

/** The settings card and its route share the deployment's published flag. */
export const demoManagementRoutes = demoModeRoutes([
  {
    ...card,
    name: 'itam-settings-demo',
    authz: {
      resource: { type: 'settings', id: 'demoMode.data' },
      action: 'read',
    },
  },
]);

// Ordinary installations retain ITAM's existing sample importer at the same URL.
// Only the dedicated management route uses the plugin's settings permissions.
export const demoSettingsRoutes = demoManagementRoutes.length
  ? demoManagementRoutes
  : [
      {
        ...card,
        name: 'itam-settings-sample-data',
        authz: {
          resource: { type: 'page' as const, id: 'itam-settings' },
          action: 'access',
        },
      },
    ];
