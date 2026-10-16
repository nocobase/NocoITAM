import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useQuery } from '@tanstack/react-query';
import { Database, X } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { Button, buttonVariants } from '@/components/ui/button';
import { useApi } from '@/lib/itam/api';

/**
 * The strip above every page that offers the demo dataset (after NocoCRM's
 * DemoBanner): shown only to whoever may import it — the settings grant the
 * demo endpoints require — and only while none is imported. It links to the
 * 演示数据 tab of the settings page and goes by itself once the import is
 * done; dismissed, it stays away in this browser. The dismissal is a
 * convenience, so blocked or cleared storage only means it shows again.
 */
const DISMISSED_KEY = 'nocoitam:demo-banner-dismissed';

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function DemoBanner(): ReactElement | null {
  const { t } = useTranslation();
  const api = useApi();
  const [dismissed, setDismissed] = useState(readDismissed);
  const { can } = useCan({
    resource: { type: 'settings', id: 'itam.settings' },
    action: 'update',
  });
  // The same query the settings card reads, so an import or a clear there
  // shows here at once.
  const status = useQuery({
    queryKey: ['itam', 'demo'],
    queryFn: async () =>
      (
        await api.request<{ data: { generated: boolean } }>({
          path: 'itam/demo',
        })
      ).data,
    enabled: can === true && !dismissed,
  });
  if (dismissed || can !== true || status.data?.generated !== false)
    return null;
  const dismiss = (): void => {
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // Storage unavailable: hidden until the page is loaded again.
    }
    setDismissed(true);
  };
  return (
    <div
      role='region'
      aria-label={t('settings.demo.title')}
      className='flex items-center gap-3 border-b bg-info px-4 py-2 text-sm sm:px-6'
    >
      <Database className='size-4 shrink-0 text-info-foreground' aria-hidden />
      <p className='min-w-0 flex-1 text-foreground'>
        {t('settings.demo.banner')}
      </p>
      {/* A link drawn as a button: it goes to another page. */}
      <Link
        to='/settings/demo'
        className={buttonVariants({ size: 'sm', className: 'shrink-0' })}
      >
        {t('settings.demo.bannerAction')}
      </Link>
      <Button
        size='icon'
        variant='ghost'
        className='size-8 shrink-0 text-muted-foreground'
        aria-label={t('settings.demo.bannerDismiss')}
        onClick={dismiss}
      >
        <X />
      </Button>
    </div>
  );
}
