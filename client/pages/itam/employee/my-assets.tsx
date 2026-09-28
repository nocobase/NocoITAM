import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { EmptyState } from '@/components/itam/empty-state';
import { Pagination } from '@/components/itam/pagination';
import { RecordLink } from '@/components/itam/record-link';
import { Page, PageHeader } from '@/components/itam/page-header';
import { DeviceStatusBadge } from '@/components/itam/status-badge';
import { useItamList, type ItamRecord } from '@/lib/itam/api';
import { DEVICES_PATH } from '@/lib/itam/device-api';
import { formatDate, text } from '@/lib/itam/format';
import { useServerPage } from '@/lib/itam/paging';
import { useReferenceNames } from '@/lib/itam/references';

/**
 * The devices the signed-in reader holds. `view=mine` is what narrows it:
 * an employee's record access would do it anyway, but IT support and the
 * Asset Manager read every device and this is their page too.
 */
export default function MyDevicesPage(): ReactElement {
  const { t } = useTranslation();
  const paging = useServerPage();
  const list = useItamList<ItamRecord>(DEVICES_PATH, {
    page: paging.page,
    pageSize: paging.pageSize,
    sort: 'deviceNo',
    order: 'asc',
    filter: { view: 'mine' },
  });
  const rows = list.data?.data ?? [];
  const pagination = paging.pagination(list.data?.total);
  const names = useReferenceNames([
    { collection: 'models', ids: rows.map((row) => text(row.modelId)) },
  ]);
  return (
    <Page>
      <PageHeader
        title={t('employee.myAssets')}
        total={list.data?.total}
        description={t('employee.myAssetsDescription')}
      />
      {list.data && rows.length === 0 ? (
        <EmptyState title={t('employee.noAssets')} />
      ) : (
        <ul className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
          {rows.map((row) => (
            <li key={row.id}>
              {/* The card is the link: a plain click opens the device in
                  the record drawer, and the address still works in a new
                  tab or copied. */}
              <RecordLink
                to={`/devices/${text(row.id)}`}
                className='block space-y-1 rounded-lg border border-border bg-card p-4 text-sm hover:border-primary/50'
              >
                <div className='flex items-center justify-between gap-2'>
                  <span className='font-medium'>{text(row.deviceNo)}</span>
                  <DeviceStatusBadge status={row.status} />
                </div>
                <div>{text(row.name)}</div>
                <div className='text-xs text-muted-foreground'>
                  {names.models?.get(text(row.modelId)) ?? ''}
                </div>
                <div className='text-xs text-muted-foreground'>
                  {t('fields.assignedAt')}: {formatDate(row.assignedAt) || '—'}
                  {' · '}
                  {t('fields.warrantyEndDate')}:{' '}
                  {formatDate(row.warrantyEndDate) || '—'}
                </div>
              </RecordLink>
            </li>
          ))}
        </ul>
      )}
      {pagination ? <Pagination {...pagination} /> : null}
    </Page>
  );
}
