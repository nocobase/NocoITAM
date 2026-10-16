import { useTranslation } from '@nocobase/i18n/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarX,
  SlidersHorizontal,
  Undo2,
  UserPlus,
  UserX,
} from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useParams } from 'react-router';

import { ConfirmDialog } from '@/components/itam/confirm-dialog';
import { InfoRow } from '@/components/itam/detail-page';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { purchasesRequest } from '@/lib/itam/purchases';
import { DataTable } from '@/components/itam/data-table';
import { HolderCell } from '@/components/itam/holder-link';
import { usePagedRows } from '@/lib/itam/paging';
import { ReferenceSelect } from '@/components/itam/reference-select';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAnnounce } from '@/lib/itam/announce';
import { useApi, useItamRecord, type ItamRecord } from '@/lib/itam/api';
import type { DomainConfig } from '@/lib/itam/domain';
import {
  ENTITLEMENT_CREATE_FIELDS,
  ENTITLEMENT_FIELDS,
  ENTITLEMENTS_PATH,
} from '@/lib/itam/entitlements';
import { formatDate, text, todayIso } from '@/lib/itam/format';
import { useCollectionPermissions } from '@/lib/itam/permissions';

import { InlineField } from '@/components/itam/inline-field';
import type { FieldDefinition } from '@/lib/itam/fields';

import { ProductKeyValue } from './product-key.js';
import { useReferenceNames } from '@/lib/itam/references';
import { useConfirm } from '@/lib/itam/use-confirm';

/**
 * Software entitlements of both kinds on one page: the list filters by
 * kind (no statistics strip, as on the stock lists), the detail shows the fields of the record's kind, and the actions
 * (seat assignment, key reveal) follow the kind too.
 */
// The last name the create dialog filled in from a software product.
let derivedName = '';

/**
 * A seat's own key as the inline editor sees it: never read back, only
 * replaced, so the editor opens empty (see `writeOnly` in `fields.ts`).
 */
const SEAT_KEY_FIELD: FieldDefinition = {
  key: 'productKey',
  label: 'fields.seatProductKey',
  type: 'text',
  writeOnly: true,
};

// eslint-disable-next-line react-refresh/only-export-components -- a domain config is data that references its components
export const entitlementDomain: DomainConfig = {
  name: 'entitlements',
  path: ENTITLEMENTS_PATH,
  route: 'entitlements',
  i18n: 'entitlements',
  fields: ENTITLEMENT_FIELDS,
  createFields: ENTITLEMENT_CREATE_FIELDS,
  // Beside the search box, in column order.
  filterFields: [
    'kind',
    'softwareProductId',
    'categoryId',
    'manufacturerId',
    'complianceStatus',
  ],
  nameField: 'name',
  // As on devices and stock: the name defaults to the software product's
  // name and follows it until the user types one.
  derive: (change, values) => {
    if (change.key !== 'softwareProductId') return undefined;
    const product = change.record;
    const next: Record<string, unknown> = {
      categoryId: product?.categoryId ?? null,
      manufacturerId: product?.manufacturerId ?? null,
    };
    const current = text(values.name);
    if (!current || current === derivedName) {
      derivedName = product ? text(product.name) : '';
      next.name = derivedName || null;
    }
    return next;
  },
  tabs: [
    { key: 'seats', label: 'tabs.seats' },
    // The orders it was bought and renewed through: the receipts are the
    // purchase history, since an entitlement keeps no purchase fields.
    {
      key: 'purchases',
      label: 'tabs.purchaseOrders',
      countBy: (record) =>
        purchasesRequest(ENTITLEMENTS_PATH, String(record.id)),
    },
    { key: 'attachments', label: 'tabs.attachments' },
  ],
  // The key reads as a mask with the eye beside it; revealing is its own
  // audited operation, so the value never arrives with the record.
  fieldDisplay: (field, record) =>
    field.key === 'productKey' ? (
      <ProductKeyValue
        entitlementId={text(record.id)}
        hasKey={Boolean(record.hasProductKey)}
      />
    ) : undefined,
  Notice: EntitlementNotice,
  Actions: EntitlementActions,
  // No summary strip: the kind, the seat counts, the compliance status and
  // the maintenance date all have a row in the information card, and a strip
  // repeating them only pushed the card down.
  summaryTimestamps: false,
  // 合规状态, the seat counts and who holds the seats lead 基本信息
  // (2026-10-16), as a device's status and holder do.
  BasicLead: EntitlementLead,
  // Assigning a seat is what this page is for; deletion sits in the "more"
  // menu, as it does on a device or a stock item.
  deleteInMenu: true,
};

const seatHolderType = (record: ItamRecord): 'person' | 'device' =>
  record.kind === 'perpetual' && record.licensingModel === 'perDevice'
    ? 'device'
    : 'person';

function EntitlementActions({
  record,
}: {
  readonly record: ItamRecord;
}): ReactElement | null {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const permissions = useCollectionPermissions('entitlements', [
    'assignSeat',
    'viewKey',
    // The seat count is no longer an editable field: adjusting it is an
    // update the record states a reason for.
    'update',
  ]);
  const subscription = record.kind === 'subscription';
  const holderType = seatHolderType(record);
  const [dialog, setDialog] = useState<'seat' | 'seats'>();
  // Seats bought or dropped outside an order, as a stock item takes manual
  // stock in: a direction, a number and why.
  const [seatChange, setSeatChange] = useState<'add' | 'remove'>('add');
  const [seatChangeCount, setSeatChangeCount] = useState('1');
  const [seatChangeNotes, setSeatChangeNotes] = useState('');
  const [holderId, setHolderId] = useState<string | null>(null);
  const [account, setAccount] = useState('');
  // A perpetual seat may carry its own key; empty means the shared one.
  const [seatKey, setSeatKey] = useState('');
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['itam', ENTITLEMENTS_PATH] });
  const assign = useMutation({
    mutationFn: async () =>
      api.request({
        path: `${ENTITLEMENTS_PATH}/${record.id}/assign-seats`,
        method: 'POST',
        json: {
          seats: [
            subscription
              ? { holderType: 'person', holderId, account }
              : { holderType, holderId, productKey: seatKey.trim() || null },
          ],
        },
      }),
    onSuccess: async () => {
      await invalidate();
      setDialog(undefined);
      setHolderId(null);
      setAccount('');
      setSeatKey('');
    },
  });
  const adjustSeats = useMutation({
    mutationFn: async () =>
      api.request({
        path: `${ENTITLEMENTS_PATH}/${record.id}/adjust-seats`,
        method: 'POST',
        json: {
          quantity:
            (seatChange === 'add' ? 1 : -1) * Number(seatChangeCount || 0),
          notes: seatChangeNotes.trim() || null,
        },
      }),
    onSuccess: async () => {
      await invalidate();
      setDialog(undefined);
      setSeatChangeCount('1');
      setSeatChangeNotes('');
    },
  });
  const seatCount =
    record.seatCount === null || record.seatCount === undefined
      ? null
      : Number(record.seatCount);
  // Any stated seat count limits assignment: a flat-priced subscription's
  // is its cap.
  const limited = seatCount !== null;
  const available = limited
    ? Number(seatCount) - Number(record.assignedCount ?? 0)
    : Number.POSITIVE_INFINITY;
  return (
    <>
      {permissions.assignSeat ? (
        <Button
          onClick={() => {
            assign.reset();
            setDialog('seat');
          }}
          disabled={available <= 0}
        >
          <UserPlus data-icon='inline-start' />
          {t('entitlements.assignSeat')}
        </Button>
      ) : null}
      {limited && permissions.update ? (
        <Button
          variant='outline'
          onClick={() => {
            adjustSeats.reset();
            setSeatChange('add');
            setDialog('seats');
          }}
        >
          <SlidersHorizontal data-icon='inline-start' />
          {t('entitlements.adjustSeats')}
        </Button>
      ) : null}
      <ConfirmDialog
        open={dialog === 'seat'}
        onOpenChange={(open) => !open && setDialog(undefined)}
        title={t('entitlements.assignSeat')}
        description={
          limited
            ? t('stock.available', { count: available })
            : t('entitlements.unlimitedSeats')
        }
        busy={assign.isPending}
        error={assign.error}
        disabled={subscription ? !account.trim() : !holderId}
        confirmLabel={t('entitlements.assignSeat')}
        onConfirm={() => assign.mutate()}
      >
        <div className='grid gap-1.5'>
          <Label htmlFor='seat-holder'>
            {t(`enums.assigneeType.${holderType}`)}
            {subscription ? null : <span className='text-destructive'> *</span>}
          </Label>
          <ReferenceSelect
            id='seat-holder'
            reference={{
              collection: holderType === 'device' ? 'devices' : 'people',
              ...(holderType === 'person'
                ? { filter: { 'employmentStatus:ne': 'left' } }
                : {}),
            }}
            value={holderId}
            onChange={setHolderId}
          />
        </div>
        {subscription ? (
          <div className='grid gap-1.5'>
            <Label htmlFor='seat-account'>
              {t('fields.account')} <span className='text-destructive'>*</span>
            </Label>
            <Input
              id='seat-account'
              type='email'
              value={account}
              onChange={(event) => setAccount(event.target.value)}
            />
          </div>
        ) : (
          <div className='grid gap-1.5'>
            <Label htmlFor='seat-key'>{t('entitlements.seatKey')}</Label>
            <Input
              id='seat-key'
              value={seatKey}
              onChange={(event) => setSeatKey(event.target.value)}
            />
            <p className='text-xs text-muted-foreground'>
              {t('entitlements.seatKeyHint')}
            </p>
          </div>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === 'seats'}
        onOpenChange={(open) => !open && setDialog(undefined)}
        title={t('entitlements.adjustSeats')}
        description={t('entitlements.adjustSeatsHint')}
        busy={adjustSeats.isPending}
        error={adjustSeats.error}
        disabled={
          !Number.isInteger(Number(seatChangeCount)) ||
          Number(seatChangeCount) < 1
        }
        confirmLabel={t('actions.save')}
        onConfirm={() => adjustSeats.mutate()}
      >
        <div className='grid gap-1.5'>
          <Label htmlFor='seat-change'>
            {t('entitlements.seatChangeDirection')}
          </Label>
          <div className='flex gap-2' id='seat-change'>
            {(['add', 'remove'] as const).map((direction) => (
              <Button
                key={direction}
                type='button'
                size='sm'
                variant={seatChange === direction ? 'default' : 'outline'}
                onClick={() => setSeatChange(direction)}
              >
                {t(
                  direction === 'add'
                    ? 'entitlements.addSeats'
                    : 'entitlements.removeSeats',
                )}
              </Button>
            ))}
          </div>
        </div>
        <div className='grid gap-1.5'>
          <Label htmlFor='seat-change-count'>
            {t('fields.quantity')} <span className='text-destructive'>*</span>
          </Label>
          <Input
            id='seat-change-count'
            type='number'
            min={1}
            step={1}
            value={seatChangeCount}
            onChange={(event) => setSeatChangeCount(event.target.value)}
          />
          <p className='text-xs text-muted-foreground'>
            {t('entitlements.seatsAfterChange', {
              count:
                Number(seatCount ?? 0) +
                (seatChange === 'add' ? 1 : -1) * Number(seatChangeCount || 0),
            })}
          </p>
        </div>
        <div className='grid gap-1.5'>
          <Label htmlFor='seat-change-notes'>{t('fields.notes')}</Label>
          <Textarea
            id='seat-change-notes'
            rows={2}
            value={seatChangeNotes}
            onChange={(event) => setSeatChangeNotes(event.target.value)}
          />
        </div>
      </ConfirmDialog>
    </>
  );
}

/**
 * A subscription set not to renew whose date has passed has ended: say so
 * above the page, and how many seats are still held on it.
 */
function EntitlementNotice({
  record,
}: {
  readonly record: ItamRecord;
}): ReactElement | null {
  const { t } = useTranslation();
  const end = text(record.expiryDate).slice(0, 10);
  const [today] = useState(todayIso);
  if (
    record.kind !== 'subscription' ||
    record.autoRenew !== false ||
    !end ||
    end >= today
  )
    return <LeaverSeatsNotice record={record} />;
  const held = Number(record.assignedCount ?? 0);
  return (
    <Alert>
      <CalendarX />
      <AlertTitle>
        {t('entitlements.endedTitle', { date: formatDate(end) })}
      </AlertTitle>
      <AlertDescription>
        {held > 0
          ? t('entitlements.endedSeats', { count: held })
          : t('entitlements.endedNoSeats')}
      </AlertDescription>
    </Alert>
  );
}

/** The seats query the 席位 tab reads; the notice shares it. */
function useSeats(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: ['itam', ENTITLEMENTS_PATH, 'seats', id],
    queryFn: async () =>
      (
        await api.request<{
          data: { seats: ItamRecord[] };
        }>({ path: `${ENTITLEMENTS_PATH}/${id}/seats` })
      ).data,
  });
}

/**
 * Seats people who have left still hold, taken back in one go (2026-10-17,
 * in place of the 授权续费 agent): the first thing to do before a renewal,
 * and before buying more. Above the page while any is held; the button for
 * whoever may reclaim seats.
 */
function LeaverSeatsNotice({
  record,
}: {
  readonly record: ItamRecord;
}): ReactElement | null {
  const { t } = useTranslation();
  const id = text(record.id);
  const api = useApi();
  const seats = useSeats(id);
  const permissions = useCollectionPermissions('entitlements', ['assignSeat']);
  const announce = useAnnounce();
  const confirm = useConfirm();
  const held = (seats.data?.seats ?? []).filter((seat) => seat.holderLeft);
  const reclaim = useMutation({
    mutationFn: async () =>
      api.request({
        path: `${ENTITLEMENTS_PATH}/${id}/reclaim-seats`,
        method: 'POST',
        json: { seatIds: held.map((seat) => text(seat.id)) },
      }),
    onSuccess: async () => {
      await announce(
        t('people.recovery.toast.reclaimed', { label: text(record.name) }),
        held.map((seat) => text(seat.holderId)),
      );
    },
  });
  if (!held.length) return null;
  return (
    <Alert>
      <UserX />
      <AlertTitle>
        {t('entitlements.leaverSeatsTitle', { count: held.length })}
      </AlertTitle>
      <AlertDescription>
        <p>{t('entitlements.leaverSeatsHint')}</p>
        {permissions.assignSeat ? (
          <Button
            size='sm'
            variant='outline'
            className='mt-2'
            disabled={reclaim.isPending}
            onClick={() =>
              confirm.ask({
                title: t('entitlements.reclaimLeaverSeats'),
                description: t('entitlements.reclaimLeaverSeatsConfirm', {
                  count: held.length,
                }),
                confirmLabel: t('entitlements.reclaimLeaverSeats'),
                destructive: true,
                action: () => reclaim.mutateAsync(),
              })
            }
          >
            <Undo2 data-icon='inline-start' />
            {t('entitlements.reclaimLeaverSeats')}
          </Button>
        ) : null}
      </AlertDescription>
      {confirm.dialog}
    </Alert>
  );
}

/**
 * Tab: active seats with reclaim. A seat names its holder (person or
 * device) and, for subscriptions, the account.
 */
export default function EntitlementSeatsTab(): ReactElement {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const api = useApi();
  const queryClient = useQueryClient();
  const record = useItamRecord<ItamRecord>(ENTITLEMENTS_PATH, id);
  const permissions = useCollectionPermissions('entitlements', ['assignSeat']);
  const seats = useSeats(id);
  const announce = useAnnounce();
  const reclaim = useMutation({
    mutationFn: async (seatId: string) =>
      api.request({
        path: `${ENTITLEMENTS_PATH}/${id}/reclaim-seats`,
        method: 'POST',
        json: { seatIds: [seatId] },
      }),
    onSuccess: async (_data, seatId) => {
      const seat = (seats.data?.seats ?? []).find(
        (row) => text(row.id) === seatId,
      );
      await announce(
        t('people.recovery.toast.reclaimed', {
          label: text(record.data?.name),
        }),
        seat && text(seat.holderType) === 'person' ? [text(seat.holderId)] : [],
      );
    },
  });
  const confirm = useConfirm();
  // A seat's own key, set where it is read.
  const setSeatKey = useMutation({
    mutationFn: async (input: {
      readonly seatId: string;
      readonly productKey: string | null;
    }) =>
      api.request({
        path: `${ENTITLEMENTS_PATH}/${id}/seat-key`,
        method: 'POST',
        json: input,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['itam', ENTITLEMENTS_PATH],
      });
    },
  });
  const rows = seats.data?.seats ?? [];
  const names = useReferenceNames([
    {
      collection: 'people',
      ids: rows
        .filter((row) => row.holderType === 'person' && row.holderId)
        .map((row) => text(row.holderId)),
    },
    {
      collection: 'devices',
      ids: rows
        .filter((row) => row.holderType === 'device' && row.holderId)
        .map((row) => text(row.holderId)),
    },
  ]);
  const paged = usePagedRows(rows);
  const subscription = record.data?.kind === 'subscription';
  return (
    <div className='space-y-6'>
      {confirm.dialog}
      {/* Read like the stock movement table: every column hugs its content,
          who holds it carries its kind's icon, and the dates close the row. */}
      <DataTable
        columns={[
          {
            key: 'holder',
            // A seat goes to a person or to a device (a per-device licence),
            // so it reads like a device's own holder column rather than
            // naming a person.
            header: t('devices.holding'),
            className: 'w-px whitespace-nowrap',
            render: (seat: ItamRecord) =>
              seat.holderId ? (
                <span className='inline-flex items-center gap-2'>
                  <HolderCell
                    holderType={text(seat.holderType)}
                    holderId={text(seat.holderId)}
                    names={
                      names[seat.holderType === 'person' ? 'people' : 'devices']
                    }
                  />
                  {/* Someone who has left: the seat to take back first. */}
                  {seat.holderLeft ? (
                    <StatusBadge tone='warning' size='sm'>
                      {t('enums.employmentStatus.left')}
                    </StatusBadge>
                  ) : null}
                </span>
              ) : (
                <span className='text-muted-foreground'>—</span>
              ),
          },
          // A subscription seat is an account on the vendor's console; a
          // perpetual one may carry its own key instead of the shared one.
          ...(subscription
            ? [
                {
                  key: 'account',
                  header: t('fields.account'),
                  className: 'w-px whitespace-nowrap',
                  render: (seat: ItamRecord) =>
                    text(seat.account) || (
                      <span className='text-muted-foreground'>—</span>
                    ),
                },
              ]
            : [
                {
                  key: 'productKey',
                  header: t('fields.seatProductKey'),
                  className: 'w-px whitespace-nowrap',
                  // Edited where it is read: the editor opens empty, as the
                  // shared key's does, so a save cannot write the mask back.
                  render: (seat: ItamRecord) => (
                    <InlineField
                      field={SEAT_KEY_FIELD}
                      value={seat.productKey}
                      editable={permissions.assignSeat}
                      display={
                        <ProductKeyValue
                          entitlementId={id}
                          seatId={text(seat.id)}
                          hasKey={Boolean(seat.hasProductKey)}
                        />
                      }
                      onSave={async (value: unknown) => {
                        await setSeatKey.mutateAsync({
                          seatId: text(seat.id),
                          productKey: text(value) || null,
                        });
                      }}
                    />
                  ),
                },
              ]),
          {
            key: 'assignedAt',
            header: t('fields.assignedAt'),
            className: 'w-px whitespace-nowrap',
            render: (seat: ItamRecord) => formatDate(seat.assignedAt),
          },
        ]}
        rows={paged.rows}
        loading={seats.isLoading}
        error={seats.error}
        empty={t('entitlements.noSeats')}
        pagination={paged.pagination}
        rowActions={(seat: ItamRecord) => (
          <span className='flex items-center justify-end gap-1'>
            {permissions.assignSeat ? (
              <Button
                size='sm'
                variant='outline'
                disabled={reclaim.isPending}
                onClick={() =>
                  confirm.ask({
                    title: t('entitlements.reclaimSeat'),
                    description: t('confirmations.reclaimSeat', {
                      name:
                        text(seat.account) ||
                        names[
                          seat.holderType === 'person' ? 'people' : 'devices'
                        ]?.get(text(seat.holderId)) ||
                        text(seat.holderId),
                    }),
                    confirmLabel: t('entitlements.reclaimSeat'),
                    destructive: true,
                    action: () => reclaim.mutateAsync(text(seat.id)),
                  })
                }
              >
                {/* The same icon as every other "take it back". */}
                <Undo2 data-icon='inline-start' />
                {t('entitlements.reclaimSeat')}
              </Button>
            ) : null}
          </span>
        )}
      />
    </div>
  );
}

/** Seat holders named on the card before 等 N 个 sends the reader to 席位. */
const LEAD_HOLDERS = 5;

/**
 * The top of an entitlement's 基本信息, above 负责人: whether its seats
 * are in order, how many there are, are taken and are free, and who holds
 * them — the first few by name, the rest counted.
 */
function EntitlementLead({
  record,
}: {
  readonly record: ItamRecord;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApi();
  const id = text(record.id);
  const seats = useQuery({
    queryKey: ['itam', ENTITLEMENTS_PATH, 'seats', id],
    queryFn: async () =>
      (
        await api.request<{
          data: { seats: ItamRecord[] };
        }>({ path: `${ENTITLEMENTS_PATH}/${id}/seats` })
      ).data,
    enabled: Boolean(id),
  });
  const held = seats.data?.seats ?? [];
  const shown = held.slice(0, LEAD_HOLDERS);
  const idsOf = (type: string) =>
    shown
      .filter((seat) => seat.holderType === type && seat.holderId)
      .map((seat) => text(seat.holderId));
  const names = useReferenceNames([
    { collection: 'people', ids: idsOf('person') },
    { collection: 'devices', ids: idsOf('device') },
  ]);
  const count = (value: unknown) =>
    value === null || value === undefined || value === '' ? '—' : text(value);
  const compliance = text(record.complianceStatus);
  return (
    <>
      <InfoRow label={t('fields.complianceStatus')}>
        {compliance ? t(`enums.complianceStatus.${compliance}`) : '—'}
      </InfoRow>
      <InfoRow label={t('fields.seatCount')}>{count(record.seatCount)}</InfoRow>
      <InfoRow label={t('fields.assignedCount')}>
        {count(record.assignedCount)}
      </InfoRow>
      <InfoRow label={t('fields.availableSeats')}>
        {count(record.availableSeats)}
      </InfoRow>
      <InfoRow label={t('stock.holder')}>
        {held.length === 0 ? (
          '—'
        ) : (
          <span className='flex flex-wrap items-center gap-x-3 gap-y-1'>
            {shown.map((seat) =>
              seat.holderId ? (
                <HolderCell
                  key={text(seat.id)}
                  holderType={text(seat.holderType)}
                  holderId={text(seat.holderId)}
                  names={
                    names[seat.holderType === 'device' ? 'devices' : 'people']
                  }
                />
              ) : (
                // A subscription seat may name an account and nobody yet.
                <span key={text(seat.id)} className='wrap-anywhere'>
                  {text(seat.account) || '—'}
                </span>
              ),
            )}
            {held.length > shown.length ? (
              <span className='text-muted-foreground'>
                {t('entitlements.moreHolders', {
                  count: held.length - shown.length,
                })}
              </span>
            ) : null}
          </span>
        )}
      </InfoRow>
    </>
  );
}
