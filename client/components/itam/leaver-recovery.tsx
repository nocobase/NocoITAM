import { useTranslation } from '@nocobase/i18n/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Undo2 } from 'lucide-react';
import { useMemo, useState, type ReactElement } from 'react';

import { AssetTypeBadge } from '@/components/itam/asset-type-badge';
import { ConfirmDialog } from '@/components/itam/confirm-dialog';
import { DataTable } from '@/components/itam/data-table';
import { DeviceReturnDialog } from '@/components/itam/device-return-dialog';
import { RecordLink } from '@/components/itam/record-link';
import { DeviceStatusBadge } from '@/components/itam/status-badge';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useApi } from '@/lib/itam/api';
import { useAiPageContext } from '@/lib/itam/ai-context';
import { DEVICES_PATH } from '@/lib/itam/device-api';
import { ENTITLEMENTS_PATH } from '@/lib/itam/entitlements';
import { formatDate } from '@/lib/itam/format';
import {
  useCollectionPermissions,
  useCurrentUserId,
} from '@/lib/itam/permissions';
import { referenceRoute, useReferenceNames } from '@/lib/itam/references';
import { useOpenRecord } from '@/lib/itam/record-drawer';
import { STOCK_PATH, STOCK_ROUTES, type StockKind } from '@/lib/itam/stock';
import { usePersonRecovery, type RecoveryItem } from '@/lib/itam/recovery';

/**
 * 待回收: what a leaver still holds, and the way to hand each item back from
 * here.
 *
 * It is where the workbench's 离职资产回收 to-do lands, so it has to be the
 * place the work gets done: a to-do that opens a page with no action on it
 * sends the reader looking for one, and a leaver's accessories and seats
 * cannot be recovered from any record page of their own — a seat has none,
 * and a stock item's page is a list of every holder.
 *
 * The plan comes from the server (`recoveryPlan`), the same rule the nightly
 * preparation and the assistant's skill read, so what is offered here cannot
 * drift from what either of those says. Each action is the operation that
 * already existed, authorized by its own endpoint; the button hides when the
 * reader does not hold the grant.
 *
 * **Everything is listed, whoever owns it** — the same rule the skill states.
 * Recovery is one handover of one person's things: a list narrowed to the
 * reader's own share lets somebody collect two of three devices and believe
 * they are finished. The row says whose it is, so a reader can see what they
 * are doing on a colleague's behalf.
 */
export function LeaverRecovery({
  personId,
  personName,
}: {
  readonly personId: string;
  readonly personName: string;
}): ReactElement | null {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const me = useCurrentUserId();
  const openRecord = useOpenRecord();
  const recovery = usePersonRecovery(personId);
  const devicePermissions = useCollectionPermissions('devices', ['return']);
  const stockPermissions = useCollectionPermissions('stockItems', ['issue']);
  const seatPermissions = useCollectionPermissions('entitlements', [
    'assignSeat',
  ]);
  const [pending, setPending] = useState<RecoveryItem>();
  // Its own memo: the reference goes into the names request and the page
  // context below, and a new array each render would re-register both.
  const items = useMemo(() => recovery.data?.items ?? [], [recovery.data]);
  const owners = useReferenceNames(
    useMemo(
      () => [{ collection: 'users', ids: items.map((item) => item.ownerId) }],
      [items],
    ),
  );
  // Registered as page context, with no shortcut of its own: the card is
  // already the list such a shortcut would ask for, so a button here would
  // have Noco read the screen back. Asking it anything from the launcher
  // while this is open still carries the list.
  const { ref: contextRef } = useAiPageContext({
    id: 'itam-leaver-recovery',
    title: t('people.recovery.title'),
    kind: 'leaverRecovery',
    getContext: () => ({
      personId,
      person: personName,
      leaveDate: recovery.data?.leaveDate ?? null,
      items: items.map((item) => ({
        kind: item.kind,
        id: item.id,
        name: item.label,
        handling: item.handling,
        status: item.status,
        quantity: item.quantity,
        account: item.account,
        ownerId: item.ownerId,
      })),
    }),
  });

  // Every action ends the same way: the holding is gone, so the lists on this
  // page, the workbench's to-do and the reminder counts all move.
  const settled = async () => {
    setPending(undefined);
    await queryClient.invalidateQueries({ queryKey: ['itam'] });
  };
  const returnDevice = useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      api.request({
        path: `${DEVICES_PATH}/${pending?.targetId ?? ''}/return`,
        method: 'POST',
        json: body,
      }),
    onSuccess: settled,
  });
  const takeBackStock = useMutation({
    mutationFn: async (item: RecoveryItem) =>
      api.request({
        path: `${STOCK_PATH}/${item.targetId}/take-back`,
        method: 'POST',
        json: {
          holderType: 'person',
          holderId: personId,
          quantity: item.quantity ?? 0,
        },
      }),
    onSuccess: settled,
  });
  const reclaimSeat = useMutation({
    mutationFn: async (item: RecoveryItem) =>
      api.request({
        path: `${ENTITLEMENTS_PATH}/${item.targetId}/reclaim-seats`,
        method: 'POST',
        json: { seatIds: [item.id] },
      }),
    onSuccess: settled,
  });

  // Somebody still employed is holding what they were issued, which is not a
  // recovery; and with nothing left to settle the card would state a job
  // already done.
  if (recovery.data?.employmentStatus !== 'left' || items.length === 0)
    return null;

  const owned = recovery.data.owned;
  const mine = items.filter((item) => item.ownerId === me).length;
  const allowed: Readonly<Record<RecoveryItem['kind'], boolean>> = {
    device: Boolean(devicePermissions.return),
    stock: Boolean(stockPermissions.issue),
    seat: Boolean(seatPermissions.assignSeat),
  };

  const act = (item: RecoveryItem) => {
    setPending(item);
    returnDevice.reset();
    takeBackStock.reset();
    reclaimSeat.reset();
  };

  // Where the row's own record lives, so a reader can look at the thing
  // before handing it back: the device, the stock item it was issued from,
  // the entitlement the seat belongs to.
  const recordOf = (item: RecoveryItem): string =>
    item.kind === 'device'
      ? `/devices/${item.targetId}`
      : item.kind === 'seat'
        ? `/entitlements/${item.targetId}`
        : `/${STOCK_ROUTES[item.assetType as StockKind] ?? 'accessories'}/${item.targetId}`;

  return (
    <Card ref={contextRef}>
      <CardHeader className='flex-row items-center justify-between gap-2'>
        <CardTitle className='flex items-center gap-2'>
          {t('people.recovery.title')}
          <Badge variant='secondary' className='tabular-nums'>
            {items.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className='space-y-3'>
        <p className='text-sm text-muted-foreground'>
          {recovery.data.leaveDate
            ? t('people.recovery.since', {
                name: personName,
                date: formatDate(recovery.data.leaveDate),
              })
            : t('people.recovery.left', { name: personName })}
          {mine > 0 ? ` ${t('people.recovery.mine', { count: mine })}` : ''}
        </p>
        {/* The asset lists' own table, because that is what this is — the
            five asset types in one list, each row saying which it is. The
            devices, the stock and the seats stay in that order; a heading
            per group would split five rows into three tables. */}
        <DataTable
          columns={[
            {
              key: 'item',
              header: t('people.recovery.columns.item'),
              // Name and what identifies this one of it in a single cell,
              // the way a device's 编号 / 名称 are: the account a seat
              // carries, and how many of a stock item are held.
              render: (item) => (
                <span className='grid gap-0.5'>
                  <span className='flex min-w-0 items-center gap-2 font-medium'>
                    {/* Which of the five it is reads in front of the name,
                        the way a to-do row is tagged: one mixed list, and
                        the tag is what tells the rows apart. */}
                    <AssetTypeBadge value={item.assetType} />
                    {item.label}
                    {item.kind === 'stock' ? (
                      <span className='ml-1 tabular-nums text-muted-foreground'>
                        ×{item.quantity ?? 0}
                      </span>
                    ) : null}
                  </span>
                  {item.account ? (
                    <span className='text-xs text-muted-foreground'>
                      {item.account}
                    </span>
                  ) : null}
                </span>
              ),
            },
            {
              key: 'state',
              header: t('fields.status'),
              className: 'w-px whitespace-nowrap',
              // Only a device has one, and it is what decided its handling.
              // Stock and seats have none to state, so the column is theirs
              // to leave empty rather than to fill with something else.
              render: (item) =>
                item.kind === 'device' ? (
                  <DeviceStatusBadge status={item.status} />
                ) : (
                  <span className='text-muted-foreground'>—</span>
                ),
            },
            {
              key: 'owner',
              header: t('fields.owner'),
              className: 'w-px whitespace-nowrap',
              render: (item) =>
                item.ownerId ? (
                  <span
                    className={
                      item.ownerId === me
                        ? 'font-medium'
                        : 'text-muted-foreground'
                    }
                  >
                    {item.ownerId === me
                      ? t('people.recovery.you')
                      : (owners.users?.get(item.ownerId) ?? item.ownerId)}
                  </span>
                ) : (
                  '—'
                ),
            },
            {
              key: 'handling',
              header: t('people.recovery.columns.handling'),
              className: 'w-px whitespace-nowrap',
              // A handling nobody can carry out from here says what it waits
              // for instead of offering a button that would make the record
              // disagree with the thing.
              render: (item) =>
                item.handling === 'wait' ||
                item.handling === 'confirmConsumed' ? (
                  <span className='text-xs text-muted-foreground'>
                    {t(`people.recovery.handling.${item.handling}`)}
                  </span>
                ) : allowed[item.kind] ? (
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={(event) => {
                      // The row opens the record; the button does its own job.
                      event.stopPropagation();
                      act(item);
                    }}
                  >
                    <Undo2 data-icon='inline-start' />
                    {t(`people.recovery.handling.${item.handling}`)}
                  </Button>
                ) : null,
            },
          ]}
          rows={items.map((item) => ({
            ...item,
            id: `${item.kind}-${item.id}`,
          }))}
          onRowClick={(item) => openRecord(recordOf(item))}
        />
        {/* The other half of offboarding, and the half no button settles:
            the records that still name them. Changing who answers for one is
            a decision, and only its current owner or its creator may make
            it, so each row is a way into that record rather than an action
            here. */}
        {owned.length > 0 ? (
          <section className='space-y-1'>
            <h4 className='text-xs font-medium text-muted-foreground'>
              {t('people.recovery.handover', { count: owned.length })}
            </h4>
            <ul className='flex flex-wrap gap-x-3 gap-y-1 text-sm'>
              {owned.map((record) => (
                <li key={`${record.collection}-${record.id}`}>
                  <RecordLink
                    to={`/${referenceRoute(record.collection)}/${record.id}`}
                  >
                    {record.label}
                  </RecordLink>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {/* Reclaiming a seat frees the licence, not the login: this
            application is a register and reaches no vendor's console. */}
        {items.some((item) => item.handling === 'reclaim') ? (
          <p className='text-xs text-muted-foreground'>
            {t('people.recovery.accountsStay')}
          </p>
        ) : null}
      </CardContent>
      {pending?.handling === 'return' ? (
        <DeviceReturnDialog
          currentLocationId={null}
          busy={returnDevice.isPending}
          error={returnDevice.error}
          onClose={() => setPending(undefined)}
          onConfirm={(body) => void returnDevice.mutate(body)}
        />
      ) : null}
      {pending?.handling === 'takeBack' ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setPending(undefined)}
          title={t('stock.return')}
          description={t('stock.takeBackDescription', {
            quantity: pending.quantity ?? 0,
          })}
          busy={takeBackStock.isPending}
          error={takeBackStock.error}
          confirmLabel={t('stock.return')}
          onConfirm={() => takeBackStock.mutate(pending)}
        >
          <div className='text-sm font-medium'>{pending.label}</div>
        </ConfirmDialog>
      ) : null}
      {pending?.handling === 'reclaim' ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setPending(undefined)}
          title={t('people.recovery.handling.reclaim')}
          description={t('people.recovery.accountsStay')}
          busy={reclaimSeat.isPending}
          error={reclaimSeat.error}
          confirmLabel={t('people.recovery.handling.reclaim')}
          onConfirm={() => reclaimSeat.mutate(pending)}
        >
          <div className='text-sm font-medium'>
            {[pending.label, pending.account].filter(Boolean).join(' · ')}
          </div>
        </ConfirmDialog>
      ) : null}
    </Card>
  );
}
