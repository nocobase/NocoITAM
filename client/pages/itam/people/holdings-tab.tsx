import { useTranslation } from '@nocobase/i18n/client';
import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { useParams } from 'react-router';

import { DeviceListEmbed } from '@/components/itam/device-list-embed';
import { LeaverRecovery } from '@/components/itam/leaver-recovery';
import { Badge } from '@/components/ui/badge';
import { masterDataPath, useApi, type ItamRecord } from '@/lib/itam/api';
import { text } from '@/lib/itam/format';
import {
  EntitlementSeatsList,
  StockHoldingsList,
} from '@/components/itam/holdings-lists';

/**
 * Everything a person holds, grouped: devices, accessories, software
 * entitlements — with 待回收 above them once they have left, which is where
 * the workbench's 离职资产回收 to-do lands and where the handing back is done.
 */
export default function PersonHoldingsTab(): ReactElement {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const api = useApi();
  const path = masterDataPath('people');
  const person = useQuery({
    queryKey: ['itam', path, id],
    enabled: Boolean(id),
    queryFn: async () =>
      (await api.request<{ data: ItamRecord }>({ path: `${path}/${id}` })).data,
  });
  // The same stats the detail page loads for its tab count; each section
  // heading shows its share.
  const stats = useQuery({
    queryKey: ['itam', path, id, 'stats'],
    enabled: Boolean(id),
    queryFn: async () =>
      (
        await api.request<{ data: { counts: Record<string, number> } }>({
          path: `${path}/${id}/stats`,
        })
      ).data,
  });
  const heading = (label: string, key: string) => (
    <h3 className='flex items-center gap-2 font-heading text-sm font-semibold'>
      {label}
      {stats.data ? (
        <Badge variant='secondary' className='tabular-nums'>
          {stats.data.counts[key] ?? 0}
        </Badge>
      ) : null}
    </h3>
  );
  return (
    <div className='space-y-6'>
      <LeaverRecovery personId={id} personName={text(person.data?.name)} />
      <section className='space-y-2'>
        {heading(t('tabs.devices'), 'devices')}
        <DeviceListEmbed filter={{ assigneeType: 'person', assigneeId: id }} />
      </section>
      <section className='space-y-2'>
        {heading(t('people.stockHeld'), 'accessories')}
        <StockHoldingsList holderType='person' holderId={id} />
      </section>
      <section className='space-y-2'>
        {heading(t('entitlements.object'), 'entitlements')}
        <EntitlementSeatsList holderType='person' holderId={id} />
      </section>
    </div>
  );
}
