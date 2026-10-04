import { useTranslation } from '@nocobase/i18n/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, Check, CornerDownRight, Undo2 } from 'lucide-react';
import { useMemo, useState, type ReactElement } from 'react';

import { AssetTypeBadge } from '@/components/itam/asset-type-badge';
import { ConfirmDialog } from '@/components/itam/confirm-dialog';
import { DataTable } from '@/components/itam/data-table';
import { DeviceReturnDialog } from '@/components/itam/device-return-dialog';
import { RecordLink } from '@/components/itam/record-link';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ReferenceSelect } from '@/components/itam/reference-select';
import { EmptyState } from '@/components/itam/empty-state';
import { DeviceStatusBadge } from '@/components/itam/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useApi } from '@/lib/itam/api';
import { useAiPageContext } from '@/lib/itam/ai-context';
import { DEVICES_PATH } from '@/lib/itam/device-api';
import { ENTITLEMENTS_PATH } from '@/lib/itam/entitlements';
import {
  useCollectionPermissions,
  useCurrentUserId,
} from '@/lib/itam/permissions';
import { recordTarget } from '@/lib/itam/record-view';
import {
  referencePath,
  referenceRoute,
  useReferenceNames,
} from '@/lib/itam/references';
import { useOpenRecord } from '@/lib/itam/record-drawer';
import { STOCK_PATH, STOCK_ROUTES, type StockKind } from '@/lib/itam/stock';
import {
  usePersonRecovery,
  type OwnedRecord,
  type RecoveryItem,
} from '@/lib/itam/recovery';

/**
 * 归属: everything in this person's name — the assets they hold, with the
 * way to take each back, and the records that answer to them, with the way
 * to hand each over.
 *
 * It is the person page's own tab rather than a card laid over one. Taking
 * a device back from the person who has it is the same act whether or not
 * they are leaving, and it was only ever offered on each device's own page;
 * leaving changes two things and no more — the line at the top saying so,
 * and that the queue's 离职资产回收 lands here.
 *
 * The plan is the server's (`recoveryPlan`), the same rule the nightly
 * preparation and `ai/skills/offboarding` read, so what this offers cannot
 * drift from what either of those says.
 *
 * **Everything is listed, whoever owns it.** A list narrowed to the reader's
 * own share lets somebody collect two of three devices and believe they are
 * finished; the row says whose it is instead.
 */
export function PersonBelongings({
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
  const [handover, setHandover] = useState<OwnedRecord>();
  const [nextOwner, setNextOwner] = useState<string | null>(null);
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
  const reassign = useMutation({
    mutationFn: async () => {
      if (!handover) return;
      await api.request({
        path: `${referencePath(handover.collection)}/${handover.id}`,
        method: 'PATCH',
        json: { [handover.field]: nextOwner },
      });
    },
    onSuccess: async () => {
      setHandover(undefined);
      setNextOwner(null);
      await queryClient.invalidateQueries({ queryKey: ['itam'] });
    },
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

  if (!recovery.data) return null;
  const left = recovery.data.employmentStatus === 'left';
  const owned = recovery.data.owned;
  // Settled rows keep their place in the list: a recovery is a job of a
  // known size, and a list that only shrinks never says what was done.
  const done = recovery.data.settled;
  // A record handed over keeps its place too, for the same reason an asset
  // does: the list is the size of the job.
  const handedOver = recovery.data.settledOwned;
  const rows: (RecoveryItem & { readonly done?: boolean })[] = [
    ...items,
    ...done.map((item) => ({ ...item, done: true })),
  ];
  // Nothing in their name at all: say so once rather than show two empty
  // headings.
  if (
    items.length === 0 &&
    done.length === 0 &&
    owned.length === 0 &&
    handedOver.length === 0
  )
    return <EmptyState title={t('people.noHoldings')} />;
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
  // Each handling reads as the word the page that owns the act uses: a seat
  // is 回收 on its entitlement's page and a holding is 归还 on the stock
  // item's, so they are those here. One act, one name, wherever it is
  // offered; which kind of thing it is, the tag in front of the name says.
  const handlingLabel = (item: RecoveryItem): string =>
    item.handling === 'reclaim'
      ? t('entitlements.reclaimSeat')
      : item.handling === 'takeBack'
        ? t('stock.return')
        : t(`people.recovery.handling.${item.handling}`);

  /**
   * What to call a record that is not an asset. The to-do rows tag these the
   * same way — 采购, 维修, 报废 — and the tag names the kind of work, not the
   * document: 「采购单」 beside its own number says 单 twice.
   */
  const DOCUMENT_TAG: Readonly<Record<string, string>> = {
    repairs: 'workbench.work.tagRepair',
    purchaseOrders: 'workbench.work.tagPurchase',
    disposals: 'workbench.work.tagDisposal',
  };

  /** Why it cannot be done yet, and what it is waiting on. */
  const waitingLabel = (item: RecoveryItem): string =>
    [handlingLabel(item), item.waitingOn?.label].filter(Boolean).join(' · ');

  const recordOf = (item: RecoveryItem): string =>
    item.kind === 'device'
      ? `/devices/${item.targetId}`
      : item.kind === 'seat'
        ? `/entitlements/${item.targetId}`
        : `/${STOCK_ROUTES[item.assetType as StockKind] ?? 'accessories'}/${item.targetId}`;

  return (
    <div ref={contextRef} className='space-y-3'>
      {/* Only a leaver gets a sentence: for everybody else the table is
            what they hold, and saying so in prose first adds nothing. */}
      {left ? (
        <p className='text-sm text-muted-foreground'>
          {/* The sentence names nobody: the page's own title does, and in
              the queue the heading above it does. */}
          {/* The date is on the record above; what this line is for is
              saying that the table below is the whole of what was in their
              name when they left, settled rows included. */}
          {t(`people.recovery.${mine > 0 ? 'leftMine' : 'left'}`, {
            count: mine,
          })}
        </p>
      ) : null}
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
                  {item.kind === 'device' ? (
                    <DeviceStatusBadge status={item.status} />
                  ) : null}
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
              // Already settled: it says so where its action was, and keeps
              // its place so the list stays the size of the job.
              item.done ? (
                <span className='flex items-center gap-1 text-xs text-muted-foreground'>
                  <Check className='size-3.5' aria-hidden='true' />
                  {/* Which act settled it: a device and a holding were
                      returned, a seat was reclaimed. "Handled" says one of
                      them happened without saying which. */}
                  {t(
                    item.handling === 'reclaim'
                      ? 'people.recovery.doneReclaim'
                      : 'people.recovery.doneReturn',
                  )}
                </span>
              ) : item.handling === 'wait' ||
                item.handling === 'confirmConsumed' ? (
                // The act this row would take, offered and refused: the
                // button says what would happen to this thing, disabled says
                // not yet, and the tooltip says why — naming the repair it
                // waits on, since "once the repair is finished" leaves the
                // reader asking which.
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span tabIndex={0} aria-label={waitingLabel(item)} />
                    }
                  >
                    <Button variant='outline' size='sm' disabled>
                      <Undo2 data-icon='inline-start' />
                      {item.kind === 'device'
                        ? t('deviceActions.return.title')
                        : t('stock.return')}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{waitingLabel(item)}</TooltipContent>
                </Tooltip>
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
                  {handlingLabel(item)}
                </Button>
              ) : null,
          },
        ]}
        rows={rows.map((item) => ({
          ...item,
          id: `${item.kind}-${item.id}`,
        }))}
        // What is inside a device, in a band of its own across the row: a
        // component is not another thing to settle beside the laptop, and
        // the status, the owner and the handling on that row are the
        // laptop's.
        subRow={(item) =>
          item.installed && item.installed.length > 0 ? (
            <span className='flex flex-wrap items-center gap-x-2 gap-y-1 pl-4 text-xs text-muted-foreground'>
              {/* Indented behind a corner, so the band reads as hanging off
                  the row above rather than as a row of its own. */}
              <span className='flex items-center gap-1'>
                <CornerDownRight className='size-3.5' aria-hidden='true' />
                {t('people.recovery.installed')}
              </span>
              {item.installed.map((part) => (
                <span key={part.id} className='flex items-center gap-1.5'>
                  <AssetTypeBadge value='component' />
                  <RecordLink to={`/components/${part.stockItemId}`}>
                    {part.name}
                  </RecordLink>
                  {part.quantity > 1 ? `×${part.quantity}` : ''}
                </span>
              ))}
            </span>
          ) : null
        }
        onRowClick={(item) => openRecord(recordOf(item))}
      />
      {/* The other half of offboarding, and the half no button settles:
            the records that still name them. Changing who answers for one is
            a decision, and only its current owner or its creator may make
            it, so each row is a way into that record rather than an action
            here. */}
      {owned.length > 0 ? (
        <section className='space-y-2 pt-3'>
          <p className='text-sm text-muted-foreground'>
            {/* The same line whether or not they have left: what the
                records need is a new name on them either way. */}
            {t('people.recovery.responsible', { count: owned.length })}
          </p>
          {/* One record per line: they are things to go and settle, not a
                set of tags. Each says what kind it is and in which seat it
                names them, because a device's 负责人 and an order's 申请人
                are not the same job. */}
          <ul className='divide-y divide-border text-sm'>
            {[
              ...owned,
              ...handedOver.map((record) => ({ ...record, done: true })),
            ].map((record) => {
              const to = `/${referenceRoute(record.collection)}/${record.id}`;
              const kind = recordTarget(to);
              return (
                <li
                  key={`${record.collection}-${record.id}`}
                  className='flex flex-wrap items-center gap-2 py-2'
                >
                  {/* An asset wears the same icon tag as everywhere else;
                        a repair or an order is not an asset, so it says what
                        kind of document it is instead. */}
                  {record.assetType ? (
                    <AssetTypeBadge value={record.assetType} />
                  ) : (
                    <Badge
                      variant='secondary'
                      data-tag='kind'
                      className='shrink-0'
                    >
                      {t(
                        DOCUMENT_TAG[record.collection] ??
                          `${kind?.i18n ?? record.collection}.object`,
                      )}
                    </Badge>
                  )}
                  <RecordLink to={to} className='font-medium'>
                    {record.label}
                  </RecordLink>
                  <span className='text-xs text-muted-foreground'>
                    {t(
                      record.field === 'requesterId'
                        ? 'fields.requester'
                        : 'fields.owner',
                    )}
                    {' · '}
                    {personName}
                  </span>
                  {/* Handing it over is an ordinary edit of that one
                        field, so it is offered here rather than only on the
                        record — the service refuses it when this reader may
                        not make it. */}
                  {'done' in record && record.done ? (
                    <span className='flex items-center gap-1 text-xs text-muted-foreground'>
                      <Check className='size-3.5' aria-hidden='true' />
                      {t('people.recovery.doneHandover')}
                    </span>
                  ) : (
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => setHandover(record)}
                    >
                      {/* Passing it to somebody else: the record stays, the
                        name on it changes. */}
                      <ArrowRightLeft data-icon='inline-start' />
                      {t('people.recovery.changeOwner')}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      {handover ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setHandover(undefined);
              setNextOwner(null);
            }
          }}
          title={t('people.recovery.changeOwner')}
          description={t('people.recovery.changeOwnerHint', {
            record: handover.label,
          })}
          busy={reassign.isPending}
          error={reassign.error}
          confirmLabel={t('people.recovery.changeOwner')}
          confirmDisabled={!nextOwner}
          onConfirm={() => reassign.mutate()}
        >
          <ReferenceSelect
            reference={{ collection: 'users' }}
            value={nextOwner}
            onChange={setNextOwner}
          />
        </ConfirmDialog>
      ) : null}
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
          // The entitlement page's own confirmation, word for word.
          title={t('entitlements.reclaimSeat')}
          description={t('confirmations.reclaimSeat', {
            name: pending.account ?? pending.label,
          })}
          busy={reclaimSeat.isPending}
          error={reclaimSeat.error}
          confirmLabel={t('entitlements.reclaimSeat')}
          onConfirm={() => reclaimSeat.mutate(pending)}
        >
          <div className='text-sm font-medium'>
            {[pending.label, pending.account].filter(Boolean).join(' · ')}
          </div>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
