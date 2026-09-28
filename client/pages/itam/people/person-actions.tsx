import { useTranslation } from '@nocobase/i18n/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { UserRoundX } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { ConfirmDialog } from '@/components/itam/confirm-dialog';
import { Button } from '@/components/ui/button';
import { masterDataPath, useApi, type ItamRecord } from '@/lib/itam/api';
import { deviceLabel, text } from '@/lib/itam/format';
import { useCollectionPermissions } from '@/lib/itam/permissions';
import { STOCK_ROUTES, type StockKind } from '@/lib/itam/stock';

import { usePersonHoldings } from './holdings.js';

/** "Mark as left": warns about what the person still holds, then marks them. */
export function PersonActions({
  record,
}: {
  readonly record: ItamRecord;
}): ReactElement | null {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const permissions = useCollectionPermissions('people', ['markLeft']);
  const [open, setOpen] = useState(false);
  const holdings = usePersonHoldings(open ? record.id : undefined);
  const markLeft = useMutation({
    mutationFn: async () =>
      (
        await api.request<{ data: { devices: ItamRecord[] } }>({
          path: `${masterDataPath('people')}/${record.id}/mark-left`,
          method: 'POST',
          json: {},
        })
      ).data,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['itam', masterDataPath('people')],
      });
      setOpen(false);
    },
  });
  if (!permissions.markLeft || record.employmentStatus === 'left') return null;
  // Everything still in the person's name, the way the workbench counts it:
  // devices, accessories, and entitlement seats.
  const devices = holdings.data?.devices ?? [];
  const stock = holdings.data?.stock ?? [];
  const seats = (holdings.data?.entitlementSeats ?? []).map((row) => ({
    id: text(row.id),
    name: [text(row.name), text(row.account)].filter(Boolean).join(' · '),
    to: `/entitlements/${text(row.entitlementId)}`,
  }));
  const groups = [
    {
      key: 'devices',
      label: t('tabs.devices'),
      items: devices.map((row) => ({
        id: text(row.id),
        name: deviceLabel(row),
        to: `/devices/${text(row.id)}`,
      })),
    },
    {
      key: 'accessories',
      label: t('people.stockHeld'),
      items: stock.map((row) => ({
        id: text(row.id),
        name: `${text(row.name)} × ${text(row.quantity)}`,
        to: `/${STOCK_ROUTES[text(row.kind) as StockKind] ?? 'accessories'}/${text(row.stockItemId)}`,
      })),
    },
    { key: 'entitlements', label: t('entitlements.object'), items: seats },
  ].filter((group) => group.items.length > 0);
  const summary = groups
    .map((group) => `${group.label} ${group.items.length}`)
    .join(t('common.listSeparator'));
  return (
    <>
      <Button variant='outline' onClick={() => setOpen(true)}>
        <UserRoundX data-icon='inline-start' />
        {t('people.markLeft')}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t('people.markLeftTitle', { name: text(record.name) })}
        description={
          groups.length > 0
            ? t('people.markLeftHoldings', { summary })
            : t('people.markLeftClean')
        }
        busy={markLeft.isPending}
        error={markLeft.error}
        destructive
        confirmLabel={t('people.markLeft')}
        onConfirm={() => markLeft.mutate()}
      >
        {groups.length > 0 ? (
          <div className='max-h-60 space-y-3 overflow-y-auto text-sm'>
            {groups.map((group) => (
              <div key={group.key} className='space-y-1'>
                <div className='text-xs font-medium text-muted-foreground'>
                  {group.label}
                </div>
                <ul className='space-y-1'>
                  {group.items.map((item) => (
                    <li key={item.id}>
                      <Link
                        className='text-link underline-offset-4 hover:underline'
                        to={item.to}
                      >
                        {item.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : null}
      </ConfirmDialog>
    </>
  );
}
