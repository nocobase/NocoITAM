import { useTranslation } from '@nocobase/i18n/client';
import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';
import { useApi, type ItamRecord } from '@/lib/itam/api';
import { formatDate, text } from '@/lib/itam/format';
import { useReferenceNames } from '@/lib/itam/references';

/** The approval steps of one record (`GET {path}/{id}/approvals`). */
export function ApprovalsTimeline({
  path,
  id,
}: {
  readonly path: string;
  readonly id: string;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApi();
  const approvals = useQuery({
    queryKey: ['itam', path, 'approvals', id],
    queryFn: async () =>
      (
        await api.request<{ data: ItamRecord[] }>({
          path: `${path}/${id}/approvals`,
        })
      ).data,
  });
  const rows = approvals.data ?? [];
  const names = useReferenceNames([
    {
      collection: 'users',
      ids: rows.flatMap((row) => [
        text(row.requestedById),
        text(row.decidedById),
      ]),
    },
  ]);
  const user = (value: unknown) =>
    names.users
      ? (names.users.get(text(value)) ?? t('common.missingRecord'))
      : '…';
  if (approvals.data && rows.length === 0)
    return (
      <p className='rounded-lg border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground'>
        {t('procurement.noApprovals')}
      </p>
    );
  return (
    <ol className='space-y-3 text-sm'>
      {rows.map((row) => (
        <li key={row.id} className='flex gap-3'>
          <div className='w-32 shrink-0 text-xs text-muted-foreground tabular-nums'>
            {formatDate(row.requestedAt, true)}
          </div>
          <div className='space-y-0.5'>
            <Badge variant='outline'>
              {t(`enums.approvalStatus.${text(row.status)}`, {
                defaultValue: text(row.status),
              })}
            </Badge>
            <div>{text(row.title)}</div>
            <div className='text-xs text-muted-foreground'>
              {t('procurement.requestedBy', { user: user(row.requestedById) })}
              {row.decidedById
                ? ` · ${t('procurement.decidedBy', { user: user(row.decidedById), date: formatDate(row.decidedAt, true) })}`
                : ''}
              {row.comment ? ` · ${text(row.comment)}` : ''}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
