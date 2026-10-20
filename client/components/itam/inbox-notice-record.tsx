import { useTranslation } from '@nocobase/i18n/client';
import { ArrowLeft } from 'lucide-react';
import type { ReactElement } from 'react';
import { useNavigate } from 'react-router';

import { RecordPane } from '@/components/itam/record-drawer';
import { Button } from '@/components/ui/button';
import { noticePath } from '@/lib/itam/inbox-notices';
import type { InboxEntry } from '#extensions/nocobase-inbox/model';

/**
 * The inbox's detail pane while an ITAM notification is picked: the record's
 * own page, as the record drawer shows it, opened at what the notification
 * is about (`?focus=`). A link inside that leaves the record moves the page.
 */
export function NoticeRecord({
  entry,
  onBack,
}: {
  readonly entry: InboxEntry;
  readonly onBack?: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const path = noticePath(entry) ?? '';
  return (
    <div className='min-w-0'>
      {onBack ? (
        <div className='px-4 pt-3 lg:hidden'>
          <Button variant='ghost' onClick={onBack}>
            <ArrowLeft data-icon='inline-start' />
            {t('common.back')}
          </Button>
        </div>
      ) : null}
      <RecordPane
        // A new pane for each notification, so its history scrolls to the
        // comment again even on the record already shown.
        key={entry.item.id}
        to={path}
        onLeave={(next) => void navigate(next)}
        fallback={
          <p className='p-6 text-sm text-muted-foreground'>
            {t('common.notFound')}
          </p>
        }
      />
    </div>
  );
}
