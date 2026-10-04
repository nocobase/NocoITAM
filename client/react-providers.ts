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
  ]);

export default reactProviders;
