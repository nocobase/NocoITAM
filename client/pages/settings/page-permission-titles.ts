import type { PagePermissionTitles } from './page-permissions.js';
import { demoSettingsRoutes } from '../../lib/itam/demo-routes.js';

/** Permission labels for application pages without navigation/breadcrumb titles (including overlays).
 * Keys are existing route names; values are application translation keys.
 * Do not add navigation/breadcrumbs or change authorization ids just to name a permission.
 */
export const pagePermissionTitles: PagePermissionTitles = {
  // Application change (ITAM, 2026-10-24): 设置's tabs and the business
  // guidance page all check the one page grant `itam-settings`
  // (client/routes.ts), which is named for all of them; the guidance page's
  // menu title would otherwise name it, being the first route to check it.
  ...Object.fromEntries(
    [
      'ai-guidance',
      'itam-settings',
      'itam-settings-mdm',
      'itam-settings-flows',
      'itam-settings-receipt-agent',
      ...demoSettingsRoutes.map((route) => route.name),
    ].map((name) => [name, 'admin.pages.itamSettings']),
  ),
  'settings-scheduled-tasks': 'admin.pages.scheduledTasks',
  // The Agents plugin's page of the agents discovered from runners, which
  // ITAM routes without a menu entry.
  agents: 'admin.pages.runnerAgents',
};
