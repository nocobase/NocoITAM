import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

/**
 * 请核对: a value the assistant filled without being sure of it (AI 整理).
 * It goes as soon as somebody changes the value, which is the check. What it
 * means is its tooltip, not a sentence above the form (2026-10-06).
 */
export function ReviewMark(): ReactElement {
  const { t } = useTranslation();
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Badge
            className='shrink-0 bg-warning text-warning-foreground'
            tabIndex={0}
          />
        }
      >
        {t('procurement.capture.check')}
      </TooltipTrigger>
      <TooltipContent>{t('procurement.capture.reviewHint')}</TooltipContent>
    </Tooltip>
  );
}
