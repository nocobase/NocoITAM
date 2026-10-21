import { useTranslation } from '@nocobase/i18n/client';
import { ExternalLink } from 'lucide-react';
import { useContext, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { OpenFullPageContext } from '@/lib/itam/detail-chrome';

/** 打开: the full page of what a pane shows, where the pane offers it. */
export function OpenFullPageButton(): ReactElement | null {
  const { t } = useTranslation();
  const open = useContext(OpenFullPageContext);
  if (!open) return null;
  return (
    <Button variant='outline' onClick={open}>
      <ExternalLink data-icon='inline-start' />
      {t('common.open')}
    </Button>
  );
}
