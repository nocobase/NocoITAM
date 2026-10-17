import { useTranslation } from '@nocobase/i18n/client';
import { Wrench } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { EmptyState } from '@/components/itam/empty-state';
import { Pagination } from '@/components/itam/pagination';
import { DocumentCard, DocumentList } from '@/components/itam/document-card';
import { RepairCompleteDialog } from '@/components/itam/repair-complete';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useItamList, type ItamRecord } from '@/lib/itam/api';
import { formatDate, formatMoney, text } from '@/lib/itam/format';
import { REPAIRS_PATH } from '@/lib/itam/operations';
import { useServerPage } from '@/lib/itam/paging';
import { useCollectionPermissions } from '@/lib/itam/permissions';
import { useReferenceNames } from '@/lib/itam/references';

/**
 * Repair records of one device or one vendor, with creation and completion.
 * Repairs have no page of their own; this list is their whole UI.
 */
export function RepairsList({
  deviceId,
  vendorId,
  completable = true,
}: {
  readonly deviceId?: string;
  readonly vendorId?: string;
  /**
   * Offer 完成维修 on a card in progress. The device page leaves it to its
   * header button; a vendor's list has no header to carry it.
   */
  readonly completable?: boolean;
}): ReactElement {
  const { t } = useTranslation();
  // Editing and deleting live on the repair's own page, reached through
  // its number; the card only completes a repair in progress.
  const permissions = useCollectionPermissions('repairs', ['complete']);
  const filter = deviceId ? { deviceId } : vendorId ? { vendorId } : {};
  const paging = useServerPage();
  const list = useItamList<ItamRecord>(REPAIRS_PATH, {
    filter,
    page: paging.page,
    pageSize: paging.pageSize,
    sort: 'sentAt',
    order: 'desc',
  });
  const rows = list.data?.data ?? [];
  const pagination = paging.pagination(list.data?.total);
  const names = useReferenceNames([
    { collection: 'vendors', ids: rows.map((row) => text(row.vendorId)) },
    {
      collection: 'devices',
      ids: rows.map((row) => text(row.deviceId)),
    },
  ]);
  const [completing, setCompleting] = useState<ItamRecord>();

  return (
    <div className='space-y-3'>
      {list.data && rows.length === 0 ? (
        <EmptyState title={t('repairs.empty')} />
      ) : (
        <DocumentList>
          {rows.map((row) => (
            <DocumentCard
              key={row.id}
              icon={Wrench}
              tone='repair'
              to={`/repairs/${text(row.id)}`}
              number={text(row.repairNo)}
              title={text(row.faultDescription) || null}
              kind={t(`enums.repairMethod.${text(row.method)}`, {
                defaultValue: text(row.method),
              })}
              status={
                <Badge
                  variant={
                    row.result === 'inProgress' ? 'secondary' : 'outline'
                  }
                  className={
                    // In progress reads as attention, like the device's
                    // 维修中 status; finished results stay neutral.
                    row.result === 'inProgress'
                      ? 'bg-warning text-warning-foreground'
                      : undefined
                  }
                >
                  {t(`enums.repairResult.${text(row.result)}`, {
                    defaultValue: text(row.result),
                  })}
                </Badge>
              }
              details={[
                // The device is implied on its own page; the vendor list
                // names it.
                !deviceId && row.deviceId
                  ? names.devices?.get(text(row.deviceId))
                  : '',
                row.actualReturnAt
                  ? `${formatDate(row.sentAt)} → ${formatDate(row.actualReturnAt)}`
                  : formatDate(row.sentAt),
                row.result === 'inProgress' && row.expectedReturnAt
                  ? t('repairs.expectedBack', {
                      date: formatDate(row.expectedReturnAt),
                    })
                  : '',
                row.vendorId ? names.vendors?.get(text(row.vendorId)) : '',
              ]}
              amount={
                row.cost !== null && row.cost !== undefined
                  ? formatMoney(row.cost, text(row.currency))
                  : null
              }
              action={
                completable &&
                permissions.complete &&
                row.result === 'inProgress' ? (
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={() => setCompleting(row)}
                  >
                    {t('repairs.complete')}
                  </Button>
                ) : undefined
              }
            />
          ))}
        </DocumentList>
      )}
      {pagination ? <Pagination {...pagination} /> : null}
      {completing ? (
        <RepairCompleteDialog
          repair={completing}
          onClose={() => setCompleting(undefined)}
        />
      ) : null}
    </div>
  );
}
