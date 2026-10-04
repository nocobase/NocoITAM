import { useTranslation } from '@nocobase/i18n/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { UserRoundX } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { ConfirmDialog } from '@/components/itam/confirm-dialog';
import { Button } from '@/components/ui/button';
import { masterDataPath, useApi, type ItamRecord } from '@/lib/itam/api';
import { text } from '@/lib/itam/format';
import { useCollectionPermissions } from '@/lib/itam/permissions';

import { usePersonHoldings } from './holdings.js';

/**
 * 标记离职: records the leave date as today, which is what makes somebody a
 * leaver. The dialog says how much is still in their name, not what each
 * item is — the 归属 tab behind it lists them, and this is a decision about
 * the person.
 */
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
      // The whole of `['itam']`, as the operation dialogs do: marking
      // somebody left moves what is read elsewhere — their 待回收, the
      // workbench's 离职资产回收 card and 待我处理's queue — and this page is
      // often reached in the record drawer over one of them.
      await queryClient.invalidateQueries({ queryKey: ['itam'] });
      setOpen(false);
    },
  });
  if (!permissions.markLeft || record.employmentStatus === 'left') return null;
  // Everything still in the person's name, the way the workbench counts it:
  // devices, accessories, and entitlement seats.
  const devices = holdings.data?.devices ?? [];
  const stock = holdings.data?.stock ?? [];
  const seats = holdings.data?.entitlementSeats ?? [];
  // How much is at stake, not what each item is: the 归属 tab behind this
  // dialog lists them, and pressing the button is a decision about the
  // person rather than about any one of their things.
  const held = devices.length + stock.length + seats.length;
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
          held > 0
            ? t('people.markLeftHoldings', { count: held })
            : t('people.markLeftClean')
        }
        busy={markLeft.isPending}
        error={markLeft.error}
        destructive
        confirmLabel={t('people.markLeft')}
        onConfirm={() => markLeft.mutate()}
      ></ConfirmDialog>
    </>
  );
}
