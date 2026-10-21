import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { useParams } from 'react-router';

import { DisposalCards } from '@/components/itam/device-disposals-list';
import { EmptyState } from '@/components/itam/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useItamList, type ItamRecord } from '@/lib/itam/api';
import { DISPOSALS_PATH } from '@/lib/itam/operations';

/**
 * The disposals that hand their devices to this vendor (接收方（供应商）), as
 * the cards a device's disposals are (2026-10-21; a table until then),
 * newest first.
 */
export default function Tab(): ReactElement {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const list = useItamList<ItamRecord>(DISPOSALS_PATH, {
    pageSize: 200,
    sort: 'createdAt',
    order: 'desc',
    filter: { recipientVendorId: id },
  });
  const rows = list.data?.data ?? [];
  if (list.isLoading) return <Skeleton className='h-40 w-full' />;
  if (rows.length === 0) return <EmptyState title={t('disposals.empty')} />;
  return <DisposalCards rows={rows} />;
}
