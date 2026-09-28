import { useTranslation } from '@nocobase/i18n/client';
import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import { useApi, type ItamRecord } from '@/lib/itam/api';
import { text } from '@/lib/itam/format';
import { useReferenceNames } from '@/lib/itam/references';

/**
 * Who a request's approval rests with, by name: the person the latest
 * request was addressed to while it waits, and the one who decided it once
 * it was decided. Resubmitting may ask someone else, so only the newest
 * approval is read — `forSubject` returns them newest first. Purchase
 * orders and disposals both answer `/<path>/:id/approvals`.
 */
export function RecordApprover({
  path,
  recordId,
}: {
  readonly path: string;
  readonly recordId: string;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApi();
  const approvals = useQuery({
    queryKey: ['itam', path, 'approvals', recordId],
    queryFn: async () =>
      (
        await api.request<{ data: ItamRecord[] }>({
          path: `${path}/${recordId}/approvals`,
        })
      ).data,
    enabled: Boolean(recordId),
  });
  const latest = approvals.data?.[0];
  const decidedBy =
    latest && text(latest.status) !== 'pending' ? text(latest.decidedById) : '';
  const askedIds = Array.isArray(latest?.approverIds)
    ? (latest.approverIds as string[])
    : [];
  const ids = decidedBy ? [decidedBy] : askedIds;
  const names = useReferenceNames([{ collection: 'users', ids }]);
  if (!approvals.data) return <span className='text-muted-foreground'>…</span>;
  // A request that never went through an approval names nobody, and a dash
  // only invites the question: it was approved on submission, because the
  // rule exempted it or approval is switched off.
  if (!latest)
    return (
      <span className='text-muted-foreground'>
        {t('procurement.noApprovalNeeded')}
      </span>
    );
  if (ids.length === 0)
    return (
      <span className='text-muted-foreground'>
        {t('procurement.anyApprover')}
      </span>
    );
  // A name map appears only once it has loaded, so a missing key means the
  // account is gone — not that it is still on its way. Showing `…` for both
  // leaves the strip looking like it never finished loading, which is what a
  // demo generated without its accounts does. The short id is what the
  // approval trail falls back to for the same reason.
  return (
    <>
      {ids
        .map((id) =>
          names.users
            ? (names.users.get(id) ?? t('common.missingRecord'))
            : '…',
        )
        .join(t('common.listSeparator'))}
    </>
  );
}
