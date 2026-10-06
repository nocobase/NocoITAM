import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';

/**
 * 请核对: a value the assistant filled without being sure of it (AI 整理).
 * It goes as soon as somebody changes the value, which is the check.
 */
export function ReviewMark(): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge className='shrink-0 bg-warning text-warning-foreground'>
      {t('procurement.capture.check')}
    </Badge>
  );
}
