import {
  defineClientReactProviders,
  type AppClientReactProviderDefinition,
} from '@nocobase/app-client/plugins';

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
  ]);

export default reactProviders;
