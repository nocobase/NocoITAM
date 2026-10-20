import { useTranslation } from '@nocobase/i18n/client';
import { Inbox } from 'lucide-react';
import type { ReactElement } from 'react';

import { cn } from '@/lib/utils';

/**
 * Says a request waits on this reader's decision (2026-10-20), on its board
 * card and its list row: the list route marks those rows `awaitingMe`
 * (`server/routes/itam/mine-view.ts`). Tinted with the primary color, as the
 * approval count is, since it is the one thing on the row asking for them.
 */
export function AwaitingMeTag({
  className,
}: {
  readonly className?: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-1.5 text-xs leading-5 font-medium whitespace-nowrap text-primary',
        className,
      )}
    >
      <Inbox aria-hidden='true' className='size-3' />
      {t('common.awaitingMe')}
    </span>
  );
}
