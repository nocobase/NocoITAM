import { useTranslation } from '@nocobase/i18n/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  ArrowRightLeft,
  Check,
  CornerDownRight,
  Undo2,
  UserX,
} from 'lucide-react';
import { Link } from 'react-router';
import { useMemo, useState, type ReactElement, type ReactNode } from 'react';

import { AssetTypeBadge } from '@/components/itam/asset-type-badge';
import { DocumentTypeBadge } from '@/components/itam/document-type-badge';
import { ConfirmDialog } from '@/components/itam/confirm-dialog';
import { DataTable } from '@/components/itam/data-table';
import { DeviceReturnDialog } from '@/components/itam/device-return-dialog';
import { useAnnounce } from '@/lib/itam/announce';
import { RecordLink } from '@/components/itam/record-link';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ReferenceSelect } from '@/components/itam/reference-select';
import { LeaverOnlineDevices } from '@/components/itam/leaver-online-devices';
import { EmptyState } from '@/components/itam/empty-state';
import { DeviceStatusBadge } from '@/components/itam/status-badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { apiErrorBody, useApi } from '@/lib/itam/api';
import { useAiPageContext } from '@/lib/itam/ai-chat';
import { DEVICES_PATH } from '@/lib/itam/device-api';
import { errorMessage } from '@/lib/itam/format';
import { isDocumentKind } from '@/lib/itam/document-kinds';
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
  // 批量: what the reader has ticked in each list, by row key, and the run
  // in progress. A batch is the row's own act performed once per ticked row,
  // through the same endpoint, so each one meets the rules it would alone —
  // and one that fails stays ticked with its reason, while the rest settle.
  const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set());
  const [tickedRecords, setTickedRecords] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [batch, setBatch] = useState<'recover' | 'handOver'>();
  const [batchOwner, setBatchOwner] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchFailed, setBatchFailed] = useState<readonly BatchFailure[]>([]);
  // Its own memo: the reference goes into the names request and the page
  // context below, and a new array each render would re-register both.
  const items = useMemo(() => recovery.data?.items ?? [], [recovery.data]);
  const owners = useReferenceNames(
    useMemo(
      () => [
        {
          collection: 'users',
          ids: [
            ...items.map((item) => item.ownerId),
            ...(recovery.data?.settled.map((item) => item.ownerId ?? null) ??
              []),
            ...(recovery.data?.owned.map((record) => record.ownerId ?? null) ??
              []),
            ...(recovery.data?.settledOwned.map((r) => r.ownerId ?? null) ??
              []),
            // Whoever a record is about to be handed to, so the toast can
            // name them.
            nextOwner,
            batchOwner,
          ],
        },
      ],
      [items, recovery.data, nextOwner, batchOwner],
    ),
  );
  const announce = useAnnounce();
  const ownerName = (id: string | null) =>
    id ? (owners.users?.get(id) ?? id) : '';
  // The person is the chat's page context while this is open, with no
  // shortcut of its own: the card is already the list such a shortcut would
  // ask for. Asking from the panel reads their holdings with the commands.
  useAiPageContext({ kind: 'people', id: personId, label: personName });

  // Every action ends the same way: the holding is gone, so the lists on this
  // page, the workbench's to-do and the reminder counts all move — and the
  // toast says what was done and, for a leaver, how much is left.
  const settled = async (title: string) => {
    setPending(undefined);
    await announce(title, [personId]);
  };
  const returnDevice = useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      api.request({
        path: `${DEVICES_PATH}/${pending?.targetId ?? ''}/return`,
        method: 'POST',
        json: body,
      }),
    onSuccess: () =>
      settled(t('people.recovery.toast.returned', { label: pending?.label })),
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
    onSuccess: (_data, item) =>
      settled(t('people.recovery.toast.takenBack', { label: item.label })),
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
      const title = t('people.recovery.toast.handedOver', {
        label: handover?.label,
        owner: ownerName(nextOwner),
      });
      setHandover(undefined);
      setNextOwner(null);
      await announce(title, [personId]);
    },
  });
  const reclaimSeat = useMutation({
    mutationFn: async (item: RecoveryItem) =>
      api.request({
        path: `${ENTITLEMENTS_PATH}/${item.targetId}/reclaim-seats`,
        method: 'POST',
        json: { seatIds: [item.id] },
      }),
    onSuccess: (_data, item) =>
      settled(t('people.recovery.toast.reclaimed', { label: item.label })),
  });

  if (!recovery.data) return null;
  const left = recovery.data.employmentStatus === 'left';
  const account = recovery.data.account;
  const owned = recovery.data.owned;
  // Settled rows keep their place in the list: a recovery is a job of a
  // known size, and a list that only shrinks never says what was done.
  const done = recovery.data.settled;
  // A record handed over keeps its place too, for the same reason an asset
  // does: the list is the size of the job.
  const handedOver = recovery.data.settledOwned;
  // Settled rows keep their place among their own kind rather than sinking
  // to the bottom: the list is the snapshot, and a reader looking for the
  // laptop should find it where the laptops are, whether or not it is back.
  const KIND_ORDER: Readonly<Record<RecoveryItem['kind'], number>> = {
    device: 0,
    stock: 1,
    seat: 2,
  };
  const rows: (RecoveryItem & { readonly done?: boolean })[] = [
    ...items,
    ...done.map((item) => ({ ...item, done: true })),
  ].sort(
    (a, b) =>
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.label.localeCompare(b.label),
  );
  // Nothing in their name at all: say so once rather than show two empty
  // headings.
  if (
    items.length === 0 &&
    done.length === 0 &&
    owned.length === 0 &&
    handedOver.length === 0
  )
    return (
      <div className='space-y-3'>
        {/* A leaver holding nothing on the register may still be signing
            in on a device (device sync). */}
        <LeaverOnlineDevices personId={personId} left={left} />
        <EmptyState title={t('people.noHoldings')} />
      </div>
    );
  // Of what is still to do, how much is this reader's. Settled rows are
  // deliberately out: the sentence promises a size of job, and counting a
  // returned device because somebody later made the reader its owner would
  // make that number go up after the work went down.
  const mine = items.filter((item) => item.ownerId === me).length;
  const allowed: Readonly<Record<RecoveryItem['kind'], boolean>> = {
    device: Boolean(devicePermissions.return),
    stock: Boolean(stockPermissions.issue),
    seat: Boolean(seatPermissions.assignSeat),
  };

  const itemKey = (item: RecoveryItem) => `${item.kind}-${item.id}`;
  const recordKey = (record: OwnedRecord) =>
    `${record.collection}-${record.id}`;
  /**
   * Whether the row's own button would act now — which is what ticking it
   * batches. A device at the repair shop waits, a consumable is confirmed
   * rather than taken back, a settled row is done, and a kind this reader
   * may not act on is not theirs to batch either.
   */
  const actionable = (item: RecoveryItem & { readonly done?: boolean }) =>
    !item.done &&
    allowed[item.kind] &&
    (item.handling === 'return' ||
      item.handling === 'takeBack' ||
      item.handling === 'reclaim');
  const selectable = rows.filter(actionable);
  const chosen = selectable.filter((item) => ticked.has(itemKey(item)));
  const chosenRecords = owned.filter((record) =>
    tickedRecords.has(recordKey(record)),
  );
  const failureOf = (error: unknown) =>
    apiErrorBody(error)?.message ?? errorMessage(error);
  /** `title` says what the rows that went through did, if any did. */
  const finishBatch = async (
    failed: readonly BatchFailure[],
    title: string | undefined,
  ) => {
    // The dialog closes (or shows what failed) before the toast is worked
    // out: announcing rereads the register, and a dialog left open meanwhile
    // re-rendered on the now empty selection — 收回 0 项, and without its
    // devices a plain confirmation in place of the return dialog — a second
    // dialog after the one that had just succeeded.
    setBatchBusy(false);
    setBatchFailed(failed);
    if (failed.length === 0) setBatch(undefined);
    if (title) await announce(title, [personId]);
    else await queryClient.invalidateQueries({ queryKey: ['itam'] });
  };
  /** Every ticked row, each through its own act; a device takes `body`. */
  const recoverChosen = async (body?: Record<string, unknown>) => {
    setBatchBusy(true);
    const failed: BatchFailure[] = [];
    const still = new Set<string>();
    const attempt = async (
      items: readonly RecoveryItem[],
      run: () => Promise<unknown>,
    ) => {
      try {
        await run();
      } catch (error) {
        for (const item of items) {
          failed.push({
            key: itemKey(item),
            label: item.label,
            message: failureOf(error),
          });
          still.add(itemKey(item));
        }
      }
    };
    for (const item of chosen.filter((row) => row.kind === 'device'))
      await attempt([item], () =>
        api.request({
          path: `${DEVICES_PATH}/${item.targetId}/return`,
          method: 'POST',
          json: body ?? {},
        }),
      );
    for (const item of chosen.filter((row) => row.kind === 'stock'))
      await attempt([item], () =>
        api.request({
          path: `${STOCK_PATH}/${item.targetId}/take-back`,
          method: 'POST',
          json: {
            holderType: 'person',
            holderId: personId,
            quantity: item.quantity ?? 0,
          },
        }),
      );
    // Seats go back one request per entitlement, the way its own page
    // reclaims several at once.
    const seats = new Map<string, RecoveryItem[]>();
    for (const item of chosen.filter((row) => row.kind === 'seat'))
      seats.set(item.targetId, [...(seats.get(item.targetId) ?? []), item]);
    for (const [entitlementId, held] of seats)
      await attempt(held, () =>
        api.request({
          path: `${ENTITLEMENTS_PATH}/${entitlementId}/reclaim-seats`,
          method: 'POST',
          json: { seatIds: held.map((item) => item.id) },
        }),
      );
    setTicked(still);
    const recovered = chosen.length - failed.length;
    await finishBatch(
      failed,
      recovered > 0
        ? t('people.recovery.toast.batchRecovered', { count: recovered })
        : undefined,
    );
  };
  /** Every ticked record to one new 负责人, each through its own endpoint. */
  const handOverChosen = async () => {
    setBatchBusy(true);
    const failed: BatchFailure[] = [];
    const still = new Set<string>();
    for (const record of chosenRecords)
      try {
        await api.request({
          path: `${referencePath(record.collection)}/${record.id}`,
          method: 'PATCH',
          json: { [record.field]: batchOwner },
        });
      } catch (error) {
        failed.push({
          key: recordKey(record),
          label: record.label,
          message: failureOf(error),
        });
        still.add(recordKey(record));
      }
    setTickedRecords(still);
    const handed = chosenRecords.length - failed.length;
    await finishBatch(
      failed,
      handed > 0
        ? t('people.recovery.toast.batchHandedOver', {
            count: handed,
            owner: ownerName(batchOwner),
          })
        : undefined,
    );
  };
  const openBatch = (kind: 'recover' | 'handOver') => {
    setBatchFailed([]);
    setBatchOwner(null);
    setBatch(kind);
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
    <div className='space-y-3'>
      {/* Their devices still online after they left (device sync). */}
      <LeaverOnlineDevices personId={personId} left={left} />
      {/* First, because it is the one thing here that is not equipment:
          their sign-in. Leaving disables it, so this is usually a settled
          line saying so. When it could not — the platform's last
          administrator, the reader's own account, or somebody who left
          before it did this — it reminds the reader, offers the way there
          to one who may, and names who can to one who may not. */}
      {left && account ? (
        account.disabled ? (
          <p className='flex items-center gap-1 text-xs text-muted-foreground'>
            <Check className='size-3.5' aria-hidden='true' />
            {t(
              account.disabledOnLeaving
                ? 'people.recovery.accountDisabledOnLeaving'
                : 'people.recovery.accountDisabled',
              { account: account.username ?? account.name },
            )}
          </p>
        ) : (
          <Alert>
            <UserX />
            <AlertTitle>{t('people.recovery.accountActiveTitle')}</AlertTitle>
            <AlertDescription>
              <span>
                {t('people.recovery.accountActive', {
                  account: account.username ?? account.name,
                })}{' '}
                {account.canDisable ? (
                  <Link
                    to='/settings/users'
                    className='font-medium text-primary hover:underline'
                  >
                    {t('people.recovery.accountDisable')}
                  </Link>
                ) : (
                  t('people.recovery.accountAskAdmin')
                )}
              </span>
            </AlertDescription>
          </Alert>
        )
      ) : null}
      {/* Only a leaver gets a sentence: for everybody else the table is
            what they hold, and saying so in prose first adds nothing. */}
      {left ? (
        <p className='text-sm text-muted-foreground'>
          {/* The sentence names nobody: the page's own title does, and in
              the queue the heading above it does. */}
          {/* The date is on the record above, and so is the status, so
              the line does not open by saying they left — 离职时 says it
              once. What it is for is saying that the table below is the
              whole of what was in their name then, settled rows
              included. */}
          {t(`people.recovery.${mine > 0 ? 'leftMine' : 'left'}`, {
            count: mine,
          })}
        </p>
      ) : null}
      {/* What is ticked, and the one act that takes it all back. It shows
          only while something is ticked: a toolbar with nothing to act on
          is a row of disabled buttons. */}
      {chosen.length > 0 ? (
        <BatchBar
          count={t('people.recovery.batch.selected', { count: chosen.length })}
          action={t('people.recovery.batch.recover')}
          icon={<Undo2 data-icon='inline-start' />}
          onAct={() => openBatch('recover')}
          onClear={() => setTicked(new Set())}
        />
      ) : null}
      {/* The asset lists' own table, because that is what this is — the
            five asset types in one list, each row saying which it is. The
            devices, the stock and the seats stay in that order; a heading
            per group would split five rows into three tables. */}
      <DataTable
        columns={[
          // Ticking, first. A row nothing can be done with yet — waiting on
          // a repair, a consumable to confirm, a settled row — keeps a
          // greyed box, so the column reads as one (2026-10-16).
          ...(selectable.length > 0
            ? [
                {
                  key: 'select',
                  header: (
                    <Checkbox
                      aria-label={t('people.recovery.batch.selectAll')}
                      checked={chosen.length === selectable.length}
                      indeterminate={
                        chosen.length > 0 && chosen.length < selectable.length
                      }
                      onCheckedChange={(checked) =>
                        setTicked(
                          checked
                            ? new Set(selectable.map(itemKey))
                            : new Set(),
                        )
                      }
                    />
                  ),
                  // Level with the row's first line, the tag's, rather than
                  // the middle of a row that wraps; the header's stays level
                  // with the header's text (2026-10-22).
                  className: 'w-px',
                  cellClassName: 'align-top',
                  render: (item: (typeof rows)[number]) =>
                    actionable(item) ? (
                      <span className='flex h-6 items-center'>
                        <Checkbox
                          aria-label={t('people.recovery.batch.select')}
                          checked={ticked.has(itemKey(item))}
                          // The row opens its record; ticking must not.
                          onClick={(event) => event.stopPropagation()}
                          onCheckedChange={(checked) =>
                            setTicked((current) => {
                              const next = new Set(current);
                              if (checked) next.add(itemKey(item));
                              else next.delete(itemKey(item));
                              return next;
                            })
                          }
                        />
                      </span>
                    ) : (
                      <span className='flex h-6 items-center'>
                        <Checkbox
                          aria-label={t('people.recovery.batch.select')}
                          checked={false}
                          disabled
                          onClick={(event) => event.stopPropagation()}
                        />
                      </span>
                    ),
                },
              ]
            : []),
          {
            key: 'item',
            header: t('people.recovery.columns.item'),
            // Tags and a name: not cut at 20rem, or the status tag is
            // clipped (2026-10-22).
            contentClassName: 'max-w-none',
            // Name and what identifies this one of it in a single cell,
            // the way a device's 编号 / 名称 are: the account a seat
            // carries, and how many of a stock item are held.
            render: (item) => (
              <span className='grid gap-0.5'>
                <span className='flex min-h-6 min-w-0 items-center gap-2 font-medium'>
                  {/* Which of the five it is reads in front of the name,
                        the way a to-do row is tagged: one mixed list, and
                        the tag is what tells the rows apart. */}
                  <AssetTypeBadge value={item.assetType} />
                  {item.label}
                  {/* A device's status is here to say whether it can be
                        taken back. Once the row is settled it is no longer
                        about this person — a returned device reads 在库,
                        which is a fact about the stock — so it goes with
                        the action it informed. */}
                  {item.kind === 'device' && !item.done ? (
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
              // Nobody to chase about a settled row. This column is here to
              // say who to tell about getting the thing back, so once the
              // row is done it has no answer — and leaving it live made it
              // drift: a returned device assigned to somebody else changes
              // the owner on a row about a person who left weeks ago. The
              // reader is not meant to watch that; the ✓ beside it is the
              // whole of what the row still has to say.
              item.done ? null : item.ownerId ? (
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
                  {/* One word for every settled row. This column answers
                      "is there still something for me to do about this
                      one", and the answer is the same however it left:
                      returned, transferred to somebody else, scrapped,
                      lost. Which of those it was is read on the record
                      itself, a click away. */}
                  {t('people.recovery.done')}
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
                    <Button variant='outline' disabled>
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
        rows={rows}
        // A device, a stock holding and a seat are different tables, so
        // their ids may meet; the kind keeps the rows apart. Keyed here, not
        // by rewriting `id`, which the row's own action sends: reclaiming a
        // seat sent `seat-<id>` and the service answered that no such seat
        // existed.
        rowKey={(item) => `${item.kind}-${item.id}`}
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
            a decision, made by anybody who may update it while it is open,
            so each row offers it. */}
      {owned.length > 0 || (left && handedOver.length > 0) ? (
        <section className='space-y-2 pt-3'>
          <p className='flex items-center gap-2 text-sm text-muted-foreground'>
            {/* Ticking every record still to hand over, in front of the line
                that introduces them, where the table above keeps its own. */}
            {owned.length > 0 ? (
              <Checkbox
                aria-label={t('people.recovery.batch.selectAll')}
                checked={chosenRecords.length === owned.length}
                indeterminate={
                  chosenRecords.length > 0 &&
                  chosenRecords.length < owned.length
                }
                onCheckedChange={(checked) =>
                  setTickedRecords(
                    checked ? new Set(owned.map(recordKey)) : new Set(),
                  )
                }
              />
            ) : null}
            {/* Before they leave, how many records name them now. After,
                the snapshot of what they answered for — handed-over rows
                included, the way the holdings above keep their settled ones,
                so the section stays once everything is handed over instead
                of vanishing with the work. */}
            {left
              ? t('people.recovery.responsibleLeft')
              : t('people.recovery.responsible', { count: owned.length })}
          </p>
          {chosenRecords.length > 0 ? (
            <BatchBar
              count={t('people.recovery.batch.selectedRecords', {
                count: chosenRecords.length,
              })}
              action={t('people.recovery.batch.handOver')}
              icon={<ArrowRightLeft data-icon='inline-start' />}
              onAct={() => openBatch('handOver')}
              onClear={() => setTickedRecords(new Set())}
            />
          ) : null}
          {/* One record per line: they are things to go and settle, not a
                set of tags. Each says what kind it is and in which seat it
                names them: the 负责人, or one of a stocktake's 执行人. */}
          <ul className='divide-y divide-border text-sm'>
            {[
              ...owned,
              ...handedOver.map((record) => ({ ...record, done: true })),
            ]
              .sort((a, b) => a.label.localeCompare(b.label))
              .map((record) => {
                const to = `/${referenceRoute(record.collection)}/${record.id}`;
                const kind = recordTarget(to);
                return (
                  <li
                    key={`${record.collection}-${record.id}`}
                    className='flex items-center gap-3 py-2'
                  >
                    {/* A box where the 移交 button is offered; a handed-over
                        row keeps the column's width without one, so the
                        names stay in line. */}
                    {owned.length > 0 ? (
                      'done' in record && record.done ? (
                        <span className='size-4 shrink-0' aria-hidden='true' />
                      ) : (
                        <Checkbox
                          aria-label={t('people.recovery.batch.select')}
                          checked={tickedRecords.has(recordKey(record))}
                          onCheckedChange={(checked) =>
                            setTickedRecords((current) => {
                              const next = new Set(current);
                              if (checked) next.add(recordKey(record));
                              else next.delete(recordKey(record));
                              return next;
                            })
                          }
                        />
                      )
                    ) : null}
                    <span className='flex min-w-0 flex-1 flex-wrap items-center gap-2'>
                      {/* An asset wears the same icon tag as everywhere
                          else; a repair or an order is not an asset, so it
                          says what kind of document it is instead. */}
                      {record.assetType ? (
                        <AssetTypeBadge value={record.assetType} />
                      ) : isDocumentKind(record.collection) ? (
                        // A work document wears its kind with the icon of
                        // its own navigation entry, as the to-do rows do.
                        <DocumentTypeBadge
                          kind={record.collection}
                          className='shrink-0'
                        />
                      ) : (
                        <Badge
                          variant='secondary'
                          data-tag='kind'
                          className='shrink-0'
                        >
                          {t(`${kind?.i18n ?? record.collection}.object`)}
                        </Badge>
                      )}
                      <RecordLink to={to} className='font-medium'>
                        {record.label}
                      </RecordLink>
                      <span className='inline-flex items-center gap-1 text-xs text-muted-foreground'>
                        {t('fields.owner')}
                        {' · '}
                        {'done' in record && record.done ? (
                          // Handed over: from them to whoever it names now,
                          // so the row says where it went rather than only
                          // that it left — the new name alone would read as
                          // if it had always been theirs.
                          <>
                            {personName}
                            <ArrowRight className='size-3' aria-hidden='true' />
                            {record.ownerId
                              ? (owners.users?.get(record.ownerId) ??
                                record.ownerId)
                              : '—'}
                          </>
                        ) : // Still theirs: the person this page is about.
                        record.ownerId ? (
                          (owners.users?.get(record.ownerId) ?? record.ownerId)
                        ) : (
                          personName
                        )}
                      </span>
                    </span>
                    {/* The act, at the far right of every row, the way the
                        holdings table above keeps its 操作 column. Handing
                        it over is an ordinary edit of that one field, so it
                        is offered here rather than only on the record — the
                        service refuses it when this reader may not make it. */}
                    {'done' in record && record.done ? (
                      <span className='flex shrink-0 items-center gap-1 text-xs text-muted-foreground'>
                        <Check className='size-3.5' aria-hidden='true' />
                        {t('people.recovery.done')}
                      </span>
                    ) : (
                      <Button
                        variant='outline'
                        className='shrink-0'
                        onClick={() => setHandover(record)}
                      >
                        {/* Passing it to somebody else: the record stays,
                            the name on it changes. */}
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
          {/* The entitlement, and only that: the description beside it
              already names whose seat is being taken back, so repeating
              the account here said the same address twice. */}
          <div className='text-sm font-medium'>{pending.label}</div>
        </ConfirmDialog>
      ) : null}
      {batch === 'recover'
        ? (() => {
            const devices = chosen.filter((item) => item.kind === 'device');
            const summary = t('people.recovery.batch.recoverSummary', {
              devices: devices.length,
              stock: chosen.filter((item) => item.kind === 'stock').length,
              seats: chosen.filter((item) => item.kind === 'seat').length,
            });
            const close = () => {
              setBatch(undefined);
              setBatchFailed([]);
            };
            // With devices among them it asks the return's three questions
            // once, for every device; without, a confirmation is all it needs.
            return devices.length > 0 ? (
              <DeviceReturnDialog
                currentLocationId={null}
                busy={batchBusy}
                error={undefined}
                title={t('people.recovery.batch.recoverTitle', {
                  count: chosen.length,
                })}
                description={`${summary}${t('people.recovery.batch.recoverDevices')}`}
                onClose={close}
                onConfirm={(body) => void recoverChosen(body)}
              >
                <BatchFailures failed={batchFailed} />
              </DeviceReturnDialog>
            ) : (
              <ConfirmDialog
                open
                onOpenChange={(open) => !open && close()}
                title={t('people.recovery.batch.recoverTitle', {
                  count: chosen.length,
                })}
                description={summary}
                busy={batchBusy}
                confirmDisabled={chosen.length === 0}
                confirmLabel={t('people.recovery.batch.recover')}
                onConfirm={() => void recoverChosen()}
              >
                <BatchFailures failed={batchFailed} />
              </ConfirmDialog>
            );
          })()
        : null}
      {batch === 'handOver' ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setBatch(undefined);
              setBatchFailed([]);
            }
          }}
          title={t('people.recovery.batch.handOverTitle', {
            count: chosenRecords.length,
          })}
          description={t('people.recovery.batch.handOverHint')}
          busy={batchBusy}
          confirmDisabled={!batchOwner || chosenRecords.length === 0}
          confirmLabel={t('people.recovery.batch.handOver')}
          onConfirm={() => void handOverChosen()}
        >
          <ReferenceSelect
            reference={{ collection: 'users' }}
            value={batchOwner}
            onChange={setBatchOwner}
          />
          <BatchFailures failed={batchFailed} />
        </ConfirmDialog>
      ) : null}
    </div>
  );
}

/** A row a batch could not settle: its key, its name and the reason. */
interface BatchFailure {
  readonly key: string;
  readonly label: string;
  readonly message: string;
}

/** What is ticked, and the one act that applies to all of it. */
function BatchBar({
  count,
  action,
  icon,
  onAct,
  onClear,
}: {
  readonly count: string;
  readonly action: string;
  readonly icon: ReactNode;
  readonly onAct: () => void;
  readonly onClear: () => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div className='flex flex-wrap items-center gap-2 rounded-md bg-muted px-3 py-1.5 text-sm'>
      <span className='font-medium'>{count}</span>
      <Button onClick={onAct}>
        {icon}
        {action}
      </Button>
      <Button variant='ghost' onClick={onClear}>
        {t('people.recovery.batch.clear')}
      </Button>
    </div>
  );
}

/**
 * The rows a batch could not settle, each with the service's own reason.
 * They stay ticked, so pressing again retries exactly those.
 */
function BatchFailures({
  failed,
}: {
  readonly failed: readonly BatchFailure[];
}): ReactElement | null {
  const { t } = useTranslation();
  if (failed.length === 0) return null;
  return (
    <div className='space-y-1 text-sm text-destructive'>
      <p>{t('people.recovery.batch.failed', { count: failed.length })}</p>
      <ul className='list-disc space-y-0.5 pl-5'>
        {failed.map((item) => (
          <li key={item.key}>
            {item.label} — {item.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
