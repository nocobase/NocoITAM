import { useTranslation } from '@nocobase/i18n/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PackagePlus, Send, SlidersHorizontal, Undo2 } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { ReferenceLink } from '@/components/itam/cells';
import { CollapsibleText } from '@/components/itam/collapsible-text';
import { ConfirmDialog } from '@/components/itam/confirm-dialog';
import { ReferenceSelect } from '@/components/itam/reference-select';
import { DataTable, type DataTableColumn } from '@/components/itam/data-table';
import { HolderLink } from '@/components/itam/holder-link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAnnounce } from '@/lib/itam/announce';
import { useApi, useItamRecord, type ItamRecord } from '@/lib/itam/api';
import type { DomainConfig } from '@/lib/itam/domain';
import { formatDate, text } from '@/lib/itam/format';
import { useServerPage } from '@/lib/itam/paging';
import { useCollectionPermissions } from '@/lib/itam/permissions';
import { useReferenceNames } from '@/lib/itam/references';
import {
  STOCK_CREATE_FIELDS,
  STOCK_I18N,
  STOCK_PATH,
  STOCK_ROUTES,
  stockFields,
  type StockKind,
} from '@/lib/itam/stock';

/** DomainConfig for one stock kind; the three list pages differ only here. */
// eslint-disable-next-line react-refresh/only-export-components -- a domain config is data that references its components
export function stockDomain(kind: StockKind): DomainConfig {
  // The last name the dialog filled in from a model, per list page.
  let derivedName = '';
  return {
    name: 'stockItems',
    path: STOCK_PATH,
    route: STOCK_ROUTES[kind],
    i18n: STOCK_I18N[kind],
    fields: stockFields(kind),
    createFields: STOCK_CREATE_FIELDS,
    // Beside the search box (the free text only matches the name).
    filterFields: ['modelId', 'categoryId', 'locationId'],
    createDefaults: { kind },
    // As on devices: the name defaults to the model name and follows the
    // model until the user types one; category and manufacturer come
    // from the model too.
    derive: (change, values) => {
      if (change.key !== 'modelId') return undefined;
      const model = change.record;
      const current = text(values.name);
      const next: Record<string, unknown> = {};
      if (!current || current === derivedName) {
        derivedName = model ? text(model.name) : '';
        next.name = derivedName || null;
      }
      next.categoryId = model?.categoryId ?? null;
      next.manufacturerId = model?.manufacturerId ?? null;
      return next;
    },
    listFilter: { kind },
    nameField: 'name',
    tabs: [
      {
        key: 'holders',
        // The movement log, with a filter for who holds the item now
        // (nothing to hold for consumables).
        label: 'stock.movements',
      },
      // Like devices: files live on the record, no picture of their own.
      { key: 'attachments', label: 'tabs.attachments' },
      // Purchases are not fields of the item: every batch may come from a
      // different order, so the receipts get a tab of their own.
      {
        key: 'purchases',
        label: 'tabs.purchaseOrders',
        // One card per order; receipts of the same order fold into it.
        countBy: (record) => ({
          path: `${STOCK_PATH}/${record.id}/purchases`,
          queryKey: ['itam', STOCK_PATH, 'purchases', String(record.id)],
          distinct: 'purchaseOrderId',
        }),
      },
    ],
    // Issuing and stocking in are what this page is for; deletion sits in the
    // "more" menu, as it does on a device.
    deleteInMenu: true,
    Actions: function Actions({ record }) {
      return <StockActions record={record} kind={kind} />;
    },
    // No summary strip. 在库 and 在外 are in 数量 (2026-10-22), not
    // leading 基本信息 as they did from 2026-10-16.
    summaryTimestamps: false,
  };
}

/** Why a quantity goes up, or down; 其他 asks for a note. */
const GAIN_REASONS = ['countSurplus', 'found', 'other'] as const;
const LOSS_REASONS = [
  'lost',
  'damaged',
  'scrapped',
  'countShortage',
  'other',
] as const;

function StockActions({
  record,
  kind,
}: {
  readonly record: ItamRecord;
  readonly kind: StockKind;
}): ReactElement | null {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const permissions = useCollectionPermissions('stockItems', [
    'issue',
    'stockIn',
    // Correcting the quantity is an update the record states a reason for,
    // as an entitlement's 调整席位 is.
    'update',
  ]);
  const [dialog, setDialog] = useState<'issue' | 'stockIn' | 'adjust'>();
  // A count that found more, or goods lost, broken or written off.
  const [adjustDirection, setAdjustDirection] = useState<'add' | 'remove'>(
    'remove',
  );
  const [adjustReason, setAdjustReason] = useState<string | null>(null);
  const reasons = adjustDirection === 'add' ? GAIN_REASONS : LOSS_REASONS;
  const reasonItems = reasons.map((reason) => ({
    value: reason,
    label: t(`enums.stockAdjustReason.${reason}`),
  }));
  const [holderType, setHolderType] = useState<
    'person' | 'location' | 'device'
  >(kind === 'component' ? 'device' : 'person');
  const [holderId, setHolderId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const run = useMutation({
    mutationFn: async (input: {
      operation: 'issue' | 'stock-in' | 'adjust';
      body: Record<string, unknown>;
    }) =>
      api.request({
        path: `${STOCK_PATH}/${record.id}/${input.operation}`,
        method: 'POST',
        json: input.body,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['itam', STOCK_PATH] });
      setDialog(undefined);
      setHolderId(null);
      setQuantity(1);
      setNotes('');
    },
  });
  const available =
    Number(record.totalQuantity ?? 0) - Number(record.usedQuantity ?? 0);
  const holderCollection =
    holderType === 'person'
      ? 'people'
      : holderType === 'location'
        ? 'locations'
        : 'devices';
  // What leaving stock is called: issued (accessories), consumed
  // (consumables) or installed (components).
  const issueLabel =
    kind === 'component'
      ? t('stock.install')
      : kind === 'consumable'
        ? t('stock.consume')
        : t('stock.issue');
  return (
    <>
      {permissions.issue ? (
        <Button
          onClick={() => {
            run.reset();
            setDialog('issue');
          }}
          disabled={available <= 0}
        >
          <Send data-icon='inline-start' />
          {issueLabel}
        </Button>
      ) : null}
      {permissions.stockIn ? (
        <Button
          variant='outline'
          onClick={() => {
            run.reset();
            setDialog('stockIn');
          }}
        >
          <PackagePlus data-icon='inline-start' />
          {t('stock.stockIn')}
        </Button>
      ) : null}
      {permissions.update ? (
        <Button
          variant='outline'
          onClick={() => {
            run.reset();
            setAdjustDirection('remove');
            setAdjustReason(null);
            setQuantity(1);
            setNotes('');
            setDialog('adjust');
          }}
        >
          <SlidersHorizontal data-icon='inline-start' />
          {t('stock.adjust')}
        </Button>
      ) : null}
      <ConfirmDialog
        open={dialog === 'adjust'}
        onOpenChange={(open) => !open && setDialog(undefined)}
        title={t('stock.adjust')}
        description={t('stock.adjustHint', { count: available })}
        busy={run.isPending}
        error={run.error}
        disabled={
          quantity < 1 ||
          !adjustReason ||
          (adjustReason === 'other' && !notes.trim()) ||
          (adjustDirection === 'remove' && quantity > available)
        }
        confirmLabel={t('actions.save')}
        onConfirm={() =>
          run.mutate({
            operation: 'adjust',
            body: {
              quantity: adjustDirection === 'add' ? quantity : -quantity,
              reason: adjustReason,
              notes: notes.trim() || null,
            },
          })
        }
      >
        <div className='grid gap-1.5'>
          <Label>{t('stock.adjustDirection')}</Label>
          <div className='flex gap-2'>
            {(['remove', 'add'] as const).map((direction) => (
              <Button
                key={direction}
                type='button'
                variant={adjustDirection === direction ? 'default' : 'outline'}
                onClick={() => {
                  setAdjustDirection(direction);
                  // The reasons differ by direction.
                  setAdjustReason(null);
                }}
              >
                {t(`stock.adjust${direction === 'add' ? 'Add' : 'Remove'}`)}
              </Button>
            ))}
          </div>
        </div>
        <div className='grid gap-1.5'>
          <Label htmlFor='adjust-quantity'>{t('fields.quantity')}</Label>
          <Input
            id='adjust-quantity'
            type='number'
            min={1}
            max={adjustDirection === 'remove' ? available : undefined}
            value={quantity}
            onChange={(event) => setQuantity(Number(event.target.value) || 1)}
          />
        </div>
        <div className='grid gap-1.5'>
          <Label htmlFor='adjust-reason'>
            {t('stock.adjustReason')}{' '}
            <span className='text-destructive'>*</span>
          </Label>
          <Select
            items={reasonItems}
            value={adjustReason}
            onValueChange={(next) => setAdjustReason(next)}
          >
            <SelectTrigger id='adjust-reason' className='w-full'>
              <SelectValue placeholder={t('common.select')} />
            </SelectTrigger>
            <SelectContent>
              {reasonItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className='grid gap-1.5'>
          <Label htmlFor='adjust-notes'>
            {t('fields.notes')}
            {adjustReason === 'other' ? (
              <span className='text-destructive'> *</span>
            ) : null}
          </Label>
          <Textarea
            id='adjust-notes'
            rows={2}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === 'issue'}
        onOpenChange={(open) => !open && setDialog(undefined)}
        title={issueLabel}
        description={t('stock.available', { count: available })}
        busy={run.isPending}
        error={run.error}
        disabled={!holderId || quantity < 1 || quantity > available}
        confirmLabel={issueLabel}
        onConfirm={() =>
          run.mutate({
            operation: 'issue',
            body: { holderType, holderId, quantity, notes: notes || undefined },
          })
        }
      >
        {kind !== 'component' ? (
          <Tabs
            value={holderType}
            onValueChange={(value) => {
              setHolderType(value as 'person' | 'location');
              setHolderId(null);
            }}
          >
            <TabsList>
              <TabsTrigger value='person'>
                {t('enums.assigneeType.person')}
              </TabsTrigger>
              <TabsTrigger value='location'>
                {t('enums.assigneeType.location')}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        ) : null}
        <div className='grid gap-1.5'>
          <Label htmlFor='issue-holder'>
            {t(`enums.assigneeType.${holderType}`)}
          </Label>
          <ReferenceSelect
            id='issue-holder'
            reference={{
              collection: holderCollection,
              ...(holderType === 'person'
                ? { filter: { 'employmentStatus:ne': 'left' } }
                : {}),
            }}
            value={holderId}
            onChange={setHolderId}
          />
        </div>
        <div className='grid gap-1.5'>
          <Label htmlFor='issue-quantity'>{t('fields.quantity')}</Label>
          <Input
            id='issue-quantity'
            type='number'
            min={1}
            max={available}
            value={quantity}
            onChange={(event) => setQuantity(Number(event.target.value) || 1)}
          />
        </div>
        <div className='grid gap-1.5'>
          <Label htmlFor='issue-notes'>{t('fields.notes')}</Label>
          <Textarea
            id='issue-notes'
            rows={2}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === 'stockIn'}
        onOpenChange={(open) => !open && setDialog(undefined)}
        title={t('stock.stockIn')}
        description={t('stock.stockInDescription', { name: text(record.name) })}
        busy={run.isPending}
        error={run.error}
        disabled={quantity < 1}
        confirmLabel={t('stock.stockIn')}
        onConfirm={() =>
          run.mutate({
            operation: 'stock-in',
            body: { quantity, notes: notes || undefined },
          })
        }
      >
        <div className='grid gap-1.5'>
          <Label htmlFor='stockin-quantity'>{t('fields.quantity')}</Label>
          <Input
            id='stockin-quantity'
            type='number'
            min={1}
            value={quantity}
            onChange={(event) => setQuantity(Number(event.target.value) || 1)}
          />
        </div>
        <div className='grid gap-1.5'>
          <Label htmlFor='stockin-notes'>{t('fields.notes')}</Label>
          <Textarea
            id='stockin-notes'
            rows={2}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>
      </ConfirmDialog>
    </>
  );
}

/** Tab: who holds the item now (accessories) or where it is installed (components). */
export function StockHoldersTab({
  kind,
  id,
}: {
  readonly kind: StockKind;
  readonly id: string;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApi();
  const announce = useAnnounce();
  const item = useItamRecord<ItamRecord>(STOCK_PATH, id);
  const permissions = useCollectionPermissions('stockItems', ['issue']);
  // The movement log by default; the filter narrows it to one movement
  // type, or to who holds the item now (by the holder's kind). A
  // consumable is used up where it goes, so it has no holders.
  const [view, setView] = useState<'all' | 'holders'>('all');
  // A movement type narrows the full log; 在外 has its own holder filter.
  const [movementType, setMovementType] = useState('any');
  const movementTypes =
    kind === 'component'
      ? ['in', 'install', 'uninstall']
      : kind === 'consumable'
        ? ['in', 'consume']
        : ['in', 'issue', 'return'];
  const [holderType, setHolderType] = useState('all');
  // The take-back waits for a confirmation, like every other stock move.
  const [pendingTakeBack, setPendingTakeBack] = useState<ItamRecord>();
  const holderTypes =
    kind === 'component' ? ['device'] : ['person', 'location'];
  const movementPage = useServerPage();
  // One log for both views: 当前持有 is the issues with something still out,
  // which the server nets against later returns.
  const movements = useQuery({
    queryKey: [
      'itam',
      STOCK_PATH,
      'movements',
      id,
      view,
      holderType,
      movementType,
      movementPage.page,
    ],
    queryFn: async () =>
      await api.request<{ data: ItamRecord[]; total: number }>({
        path: `${STOCK_PATH}/${id}/movements`,
        query: {
          page: movementPage.page,
          pageSize: movementPage.pageSize,
          ...(view === 'holders'
            ? {
                outstanding: '1',
                ...(holderType === 'all' ? {} : { holderType }),
              }
            : movementType === 'any'
              ? {}
              : { type: movementType }),
        },
      }),
  });
  const takeBack = useMutation({
    mutationFn: async (holding: ItamRecord) =>
      api.request({
        path: `${STOCK_PATH}/${id}/take-back`,
        method: 'POST',
        json: {
          holderType: holding.holderType,
          holderId: holding.holderId,
          quantity: Number(holding.quantity),
        },
      }),
    onSuccess: async (_data, holding) => {
      setPendingTakeBack(undefined);
      await announce(
        t('people.recovery.toast.takenBack', { label: text(item.data?.name) }),
        text(holding.holderType) === 'person' ? [text(holding.holderId)] : [],
      );
    },
  });
  const rows = movements.data?.data ?? [];
  const orderNames = useReferenceNames([
    {
      collection: 'purchaseOrders',
      ids: rows
        .filter((row) => row.sourceType === 'purchaseOrder')
        .map((row) => text(row.sourceId)),
    },
  ]);
  // Anything still out can be taken back — from either view.
  const takeBackOf = (row: ItamRecord): ItamRecord | undefined =>
    Number(row.remaining ?? 0) > 0
      ? {
          holderType: row.holderType,
          holderId: row.holderId,
          quantity: Number(row.remaining),
          id: String(row.id),
        }
      : undefined;
  // Every column hugs its content; the note takes whatever is left.
  const holderColumn: DataTableColumn<ItamRecord> = {
    key: 'holder',
    header: t('stock.destination'),
    className: 'w-px whitespace-nowrap',
    render: (row) =>
      row.holderId ? (
        <HolderLink
          holderType={text(row.holderType)}
          holderId={text(row.holderId)}
        />
      ) : (
        <span className='text-muted-foreground'>—</span>
      ),
  };
  // Out of stock reads negative, back in positive; an adjustment carries
  // its own sign (2026-10-22: it read +-1). A current holder's row shows
  // what is still out of that issue, signed the same way.
  const signed = (row: ItamRecord): number => {
    const amount = Number(view === 'holders' ? row.remaining : row.quantity);
    const type = text(row.type);
    if (['issue', 'consume', 'install'].includes(type))
      return -Math.abs(amount);
    return type === 'adjust' ? amount : Math.abs(amount);
  };
  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap items-center gap-3 text-sm'>
        {kind !== 'consumable' ? (
          <Tabs
            value={view}
            onValueChange={(value) => setView(value as typeof view)}
          >
            <TabsList>
              <TabsTrigger value='all'>{t('common.all')}</TabsTrigger>
              <TabsTrigger value='holders'>
                {t('stock.currentHolders')}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        ) : null}
        {view === 'all' ? (
          <Tabs value={movementType} onValueChange={setMovementType}>
            <TabsList>
              <TabsTrigger value='any'>{t('stock.anyType')}</TabsTrigger>
              {movementTypes.map((type) => (
                <TabsTrigger key={type} value={type}>
                  {t(`stock.movementTypes.${type}`)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        ) : holderTypes.length > 1 ? (
          <Tabs value={holderType} onValueChange={setHolderType}>
            <TabsList>
              <TabsTrigger value='all'>{t('common.all')}</TabsTrigger>
              {holderTypes.map((type) => (
                <TabsTrigger key={type} value={type}>
                  {t(`stock.holderTypes.${type}`)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        ) : null}
      </div>
      <DataTable
        columns={[
          {
            key: 'type',
            header: t('stock.movementType'),
            className: 'w-px whitespace-nowrap',
            render: (row) =>
              t(`stock.movementTypes.${text(row.type)}`, {
                defaultValue: text(row.type),
              }),
          },
          {
            key: 'quantity',
            header: t('fields.quantity'),
            className: 'w-px whitespace-nowrap text-right tabular-nums',
            // Back in green, out in the text's own colour.
            render: (row) => {
              const amount = signed(row);
              return (
                <span
                  className={amount > 0 ? 'text-success-foreground' : undefined}
                >
                  {amount > 0 ? '+' : '−'}
                  {Math.abs(amount)}
                </span>
              );
            },
          },
          holderColumn,
          {
            // A column of its own again (2026-10-22; under the type for an
            // hour): a receipt links its purchase order, a disposal's
            // reclaim says so, everything else was recorded by hand.
            key: 'source',
            header: t('stock.source'),
            className: 'w-px whitespace-nowrap',
            render: (row) =>
              row.sourceType === 'purchaseOrder' ? (
                <ReferenceLink
                  collection='purchaseOrders'
                  route='purchases'
                  id={row.sourceId}
                  names={orderNames.purchaseOrders}
                />
              ) : (
                <span className='text-muted-foreground'>
                  {t(
                    `stock.sources.${row.sourceType === 'disposal' ? 'disposal' : 'manual'}`,
                  )}
                </span>
              ),
          },
          {
            // An adjustment's reason before its note (2026-10-22: only the
            // note showed, under 去向 for an hour, which is not where it
            // went). Long notes fold like every other multi-line text.
            key: 'notes',
            header: t('fields.notes'),
            className: 'w-full',
            contentClassName: 'max-w-none',
            render: (row) => {
              const reason = text(row.reason)
                ? t(`enums.stockAdjustReason.${text(row.reason)}`, {
                    defaultValue: text(row.reason),
                  })
                : '';
              const note = text(row.notes);
              const said =
                reason && note
                  ? t('stock.reasonAndNote', { reason, note })
                  : reason || note;
              return said ? (
                <CollapsibleText text={said} />
              ) : (
                <span className='text-muted-foreground'>—</span>
              );
            },
          },
          {
            key: 'createdAt',
            header: t('stock.movementTime'),
            className: 'w-px whitespace-nowrap',
            render: (row) => formatDate(row.createdAt, true),
          },
        ]}
        rows={movements.data?.data}
        pagination={movementPage.pagination(movements.data?.total)}
        loading={movements.isLoading}
        rowActions={
          permissions.issue
            ? (row) => {
                const target = takeBackOf(row);
                // Small (2026-10-22): a column of full-size buttons stood out
                // above the movements themselves; outlined, so it still
                // reads as a button.
                return target ? (
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={takeBack.isPending}
                    onClick={() => {
                      takeBack.reset();
                      setPendingTakeBack(target);
                    }}
                  >
                    <Undo2 data-icon='inline-start' />
                    {kind === 'component'
                      ? t('stock.uninstall')
                      : t('stock.return')}
                  </Button>
                ) : null;
              }
            : undefined
        }
      />
      <ConfirmDialog
        open={Boolean(pendingTakeBack)}
        onOpenChange={(open) => !open && setPendingTakeBack(undefined)}
        title={kind === 'component' ? t('stock.uninstall') : t('stock.return')}
        description={t(
          kind === 'component'
            ? 'stock.uninstallDescription'
            : 'stock.takeBackDescription',
          { quantity: text(pendingTakeBack?.quantity) },
        )}
        busy={takeBack.isPending}
        error={takeBack.error}
        confirmLabel={
          kind === 'component' ? t('stock.uninstall') : t('stock.return')
        }
        onConfirm={() => pendingTakeBack && takeBack.mutate(pendingTakeBack)}
      >
        {pendingTakeBack ? (
          <div className='text-sm'>
            <span className='text-muted-foreground'>
              {t('stock.destination')}：
            </span>
            <HolderLink
              holderType={text(pendingTakeBack.holderType)}
              holderId={text(pendingTakeBack.holderId)}
            />
          </div>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
