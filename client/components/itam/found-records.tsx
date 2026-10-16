import { useTranslation } from '@nocobase/i18n/client';
import { Sparkles, X } from 'lucide-react';
import type { ReactElement } from 'react';

import { Button } from '@/components/ui/button';

/**
 * Above a list showing only the records Asset Steward found for a question asked on
 * the workbench: what they are, in Asset Steward's words, how many, and the way back
 * to the whole list. Without it a list narrowed by ids would look like the
 * whole register with most of it missing.
 */
export function FoundRecords({
  title,
  count,
  onClear,
}: {
  readonly title: string | null;
  readonly count: number;
  readonly onClear: () => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div className='flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm'>
      <Sparkles className='size-4 shrink-0 text-primary' aria-hidden='true' />
      <p className='min-w-0 flex-1 truncate'>
        {title
          ? t('search.foundTitled', { title, count })
          : t('search.found', { count })}
      </p>
      <Button variant='ghost' size='sm' onClick={onClear}>
        <X data-icon='inline-start' />
        {t('search.showAll')}
      </Button>
    </div>
  );
}
