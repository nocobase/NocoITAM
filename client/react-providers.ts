import { NotificationInAppProvider } from '@nocobase/app-plugin-notification-in-app/client';
import {
  defineClientReactProviders,
  type AppClientReactProviderDefinition,
} from '@nocobase/app-client/plugins';

import { Toaster } from '@/components/ui/toast';

import { QueryProvider } from './lib/itam/query-provider.js';
import { AppThemeProvider } from './theme/theme-provider.js';

export const reactProviders: readonly AppClientReactProviderDefinition[] =
  defineClientReactProviders([
    {
      component: AppThemeProvider,
      layer: 'root',
      name: 'theme',
    },
    {
      // Server state for every ITAM page: caching, invalidation, retries.
      component: QueryProvider,
      layer: 'root',
      name: 'itam-query',
    },
    // The one toast host. It renders what plugins and pages report through
    // `useToaster()`, which `client/service-provider.ts` connects to it.
    // Pages must not mount another.
    {
      component: Toaster,
      layer: 'application',
      name: 'toaster',
    },
    {
      // The in-app inbox reads its unread count and revision from here and
      // throws without it. The register has been sending to that channel all
      // along — an overdue loan, a leaver's recovery — into an inbox no
      // surface mounted, since the plugin registers only a development page.
      component: NotificationInAppProvider,
      layer: 'application',
      name: 'notification-in-app',
    },
  ]);

export default reactProviders;
