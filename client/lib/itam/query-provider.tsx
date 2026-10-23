import { useTranslation } from '@nocobase/i18n/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useEffect,
  useState,
  type PropsWithChildren,
  type ReactElement,
} from 'react';

import { TooltipProvider } from '@/components/ui/tooltip';
import { registerErrorTranslator } from '@/lib/itam/server-errors';

/**
 * One QueryClient for the application lifetime, plus the tooltip context.
 * The pages do not read this cache: the framework mounts its own innermost
 * around the routes, so the retry rule the pages follow is set on that one
 * (`useItamQueryDefaults`, from the layout).
 */
export function QueryProvider({ children }: PropsWithChildren): ReactElement {
  // Server error messages are translated on display; the translator follows
  // the active language.
  const { t } = useTranslation();
  useEffect(() => {
    registerErrorTranslator((key, options) => t(key, options ?? {}));
  }, [t]);
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}
