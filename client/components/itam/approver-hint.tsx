import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { useItamList } from '@/lib/itam/api';

/**
 * The line under an approver picker: what picking one means, or — when
 * nobody can be picked — that an administrator has to look at the approver
 * range or the permission sets (2026-10-18; purchase orders too since
 * 2026-10-19). A range saved with people in it can lose them all later, when
 * the permission sets change, and then nothing of that kind can be
 * submitted; this says so rather than leaving an empty list to explain
 * itself.
 */
export function ApproverHint({
  subject,
  hint,
}: {
  /** The kind of request, as the approver picker names it. */
  readonly subject: 'purchaseOrder' | 'disposal';
  /** What picking one means; nothing to say when left out. */
  readonly hint?: string;
}): ReactElement | null {
  const { t } = useTranslation();
  const approvers = useItamList('itam/users/approvers', {
    filter: { subject },
  });
  if (approvers.data && approvers.data.total === 0)
    return (
      <p role='alert' className='text-xs text-destructive'>
        {t('settings.flows.noApprovers')}
      </p>
    );
  if (!hint) return null;
  return <p className='text-xs text-muted-foreground'>{hint}</p>;
}
