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
export function ReviewMark({
  label,
  hint,
}: {
  /** 修改 for a value AI 完善 changed (2026-10-20); 请核对 by default. */
  readonly label?: string;
  /** What it was, and why, in place of what 请核对 means. */
  readonly hint?: string;
} = {}): ReactElement {
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
        {label ?? t('procurement.capture.check')}
      </TooltipTrigger>
      <TooltipContent className='max-w-80'>
        {hint ?? t('procurement.capture.reviewHint')}
      </TooltipContent>
    </Tooltip>
  );
}
