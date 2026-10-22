import { useTranslation } from '@nocobase/i18n/client';
import { ExternalLink } from 'lucide-react';
import { useContext, type ReactElement } from 'react';
import { useLocation } from 'react-router';

import { Button } from '@/components/ui/button';
import { OpenFullPageContext } from '@/lib/itam/detail-chrome';

/**
 * 打开: the full page of what a pane shows, where the pane offers it — at
 * what the pane shows now (2026-10-22): the tab picked in it, not the one
 * it opened on. Rendered inside the pane's own router.
 */
export function OpenFullPageButton(): ReactElement | null {
  const { t } = useTranslation();
  const open = useContext(OpenFullPageContext);
  const location = useLocation();
  if (!open) return null;
  return (
    <Button
      variant='outline'
      onClick={() => open(`${location.pathname}${location.search}`)}
    >
      <ExternalLink data-icon='inline-start' />
      {t('common.open')}
    </Button>
  );
}
