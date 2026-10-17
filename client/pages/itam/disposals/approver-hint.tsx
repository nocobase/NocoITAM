import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { useItamList } from '@/lib/itam/api';

/**
 * The line under a disposal's approver picker: what picking one means, or —
 * when nobody can be picked — that an administrator has to look at the
 * approver range or the permission sets (2026-10-18). A range saved with
 * people in it can lose them all later, when the permission sets change, and
 * then no disposal can be submitted; this says so rather than leaving an
 * empty list to explain itself.
 */
export function DisposalApproverHint({
  hint,
}: {
  readonly hint: string;
}): ReactElement {
  const { t } = useTranslation();
  const approvers = useItamList('itam/users/approvers', {
    filter: { subject: 'disposal' },
  });
  if (approvers.data && approvers.data.total === 0)
    return (
      <p role='alert' className='text-xs text-destructive'>
        {t('disposals.noApprovers')}
      </p>
    );
  return <p className='text-xs text-muted-foreground'>{hint}</p>;
}
