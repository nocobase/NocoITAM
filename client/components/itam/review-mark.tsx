import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';

/**
 * 请核对: a value the assistant filled without being sure of it (AI 整理).
 * It goes as soon as somebody changes the value, which is the check.
 */
/**
 * Above a form AI 整理 filled: what 请核对 means, said once where the reader
 * starts checking rather than in the column beside it.
 */
export function ReviewHint(): ReactElement {
  const { t } = useTranslation();
  return (
    <p className='flex items-center gap-1.5 text-xs text-muted-foreground'>
      <ReviewMark />
      {t('procurement.capture.reviewHint')}
    </p>
  );
}

export function ReviewMark(): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge className='shrink-0 bg-warning text-warning-foreground'>
      {t('procurement.capture.check')}
    </Badge>
  );
}
