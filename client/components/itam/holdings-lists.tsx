import { useTranslation } from '@nocobase/i18n/client';
import { useMutation } from '@tanstack/react-query';
import { Undo2 } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { useAnnounce } from '@/lib/itam/announce';
import { useApi, type ItamRecord } from '@/lib/itam/api';
import { formatDate, text } from '@/lib/itam/format';
import { usePagedRows } from '@/lib/itam/paging';
import { useEntitlementSeats, useStockHoldings } from '@/lib/itam/holdings';
import { ENTITLEMENTS_PATH } from '@/lib/itam/entitlements';
import { STOCK_PATH, STOCK_ROUTES, type StockKind } from '@/lib/itam/stock';

import { useCollectionPermissions } from '@/lib/itam/permissions';
import { useOpenRecord } from '@/lib/itam/record-drawer';
import { useReferenceNames } from '@/lib/itam/references';
import { Button } from '@/components/ui/button';

import { ReferenceLink } from './cells.js';
import { RecordLink } from './record-link.js';
import { ConfirmDialog } from './confirm-dialog.js';
import { DataTable } from './data-table.js';

import { EmptyState } from './empty-state.js';

/** Stock held by a person, location or device (components on a device). */
export function StockHoldingsList({
  holderType,
  holderId,
  kind,
  takeBack: withTakeBack = false,
}: {
  readonly holderType: 'person' | 'location' | 'device';
  readonly holderId: string;
  readonly kind?: StockKind;
  /** Offer taking each holding back (拆卸 for components, 归还 otherwise). */
  readonly takeBack?: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApi();
  const announce = useAnnounce();
  const openRecord = useOpenRecord();
  const permissions = useCollectionPermissions(
    'stockItems',
    withTakeBack ? ['issue'] : [],
  );
  const [pending, setPending] = useState<ItamRecord>();
  const component = kind === 'component';
  const takeBack = useMutation({
    mutationFn: async (holding: ItamRecord) =>
      api.request({
        path: `${STOCK_PATH}/${text(holding.stockItemId)}/take-back`,
        method: 'POST',
        json: { holderType, holderId, quantity: Number(holding.quantity) },
      }),
    onSuccess: async (_data, holding) => {
      setPending(undefined);
      await announce(
        t('people.recovery.toast.takenBack', { label: text(holding.name) }),
        holderType === 'person' ? [holderId] : [],
      );
    },
  });
  const holdings = useStockHoldings(holderType, holderId, kind);
  const paged = usePagedRows(holdings.data ?? []);
  const rows = holdings.data ?? [];
  const names = useReferenceNames([
    {
      collection: 'categories',
      ids: rows.map((row) => text(row.categoryId)).filter(Boolean),
    },
    {
      collection: 'models',
      ids: rows.map((row) => text(row.modelId)).filter(Boolean),
    },
  ]);
  if (holdings.data && rows.length === 0)
    return (
      <EmptyState
        title={t(
          kind === 'component'
            ? 'stock.noComponentsInstalled'
            : 'stock.nothingHeld',
        )}
      />
    );
  const itemRoute = (row: ItamRecord) =>
    `/${STOCK_ROUTES[text(row.kind) as StockKind] ?? 'accessories'}/${text(row.stockItemId)}`;
  // The same table shape as a 库存 tab: name, model, category, quantity,
  // date.
  return (
    <>
      <DataTable
        columns={[
          {
            key: 'name',
            header: t('fields.name'),
            // The item's name opens its record in the drawer, like every
            // related-record link.
            render: (row) => (
              <RecordLink
                to={itemRoute(row)}
                className='font-medium underline-offset-4 hover:underline'
              >
                {text(row.name)}
              </RecordLink>
            ),
          },
          {
            key: 'modelId',
            header: t('fields.model'),
            className: 'w-px whitespace-nowrap',
            render: (row) => (
              <ReferenceLink
                collection='models'
                route='models'
                id={row.modelId}
                names={names.models}
              />
            ),
          },
          {
            key: 'categoryId',
            header: t('fields.category'),
            className: 'w-px whitespace-nowrap',
            render: (row) => (
              <ReferenceLink
                collection='categories'
                route='categories'
                id={row.categoryId}
                names={names.categories}
              />
            ),
          },
          {
            key: 'quantity',
            header: t('fields.quantity'),
            className: 'w-px whitespace-nowrap tabular-nums',
            render: (row) => text(row.quantity),
          },
          {
            key: 'updatedAt',
            header: t(component ? 'fields.installedAt' : 'fields.issuedAt'),
            className: 'w-px whitespace-nowrap',
            render: (row) => formatDate(row.updatedAt),
          },
        ]}
        rows={paged.rows}
        pagination={paged.pagination}
        loading={holdings.isLoading}
        onRowClick={(row) => openRecord(itemRoute(row))}
        rowActions={
          withTakeBack && permissions.issue
            ? (row) => (
                <Button
                  variant='outline'
                  disabled={takeBack.isPending}
                  onClick={() => {
                    takeBack.reset();
                    setPending(row);
                  }}
                >
                  <Undo2 data-icon='inline-start' />
                  {t(component ? 'stock.uninstall' : 'stock.return')}
                </Button>
              )
            : undefined
        }
      />
      <ConfirmDialog
        open={Boolean(pending)}
        onOpenChange={(open) => !open && setPending(undefined)}
        title={t(component ? 'stock.uninstall' : 'stock.return')}
        description={t(
          component
            ? 'stock.uninstallDescription'
            : 'stock.takeBackDescription',
          { quantity: text(pending?.quantity) },
        )}
        busy={takeBack.isPending}
        error={takeBack.error}
        confirmLabel={t(component ? 'stock.uninstall' : 'stock.return')}
        onConfirm={() => pending && takeBack.mutate(pending)}
      >
        {pending ? (
          <div className='text-sm'>
            <span className='font-medium'>{text(pending.name)}</span>
          </div>
        ) : null}
      </ConfirmDialog>
    </>
  );
}

/**
 * Entitlement seats held by a person or device: the entitlement, its kind,
 * the account (subscriptions) and when it was assigned or last used.
 */
export function EntitlementSeatsList({
  holderType,
  holderId,
}: {
  readonly holderType: 'person' | 'device';
  readonly holderId: string;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApi();
  const announce = useAnnounce();
  const openRecord = useOpenRecord();
  const seats = useEntitlementSeats(holderType, holderId);
  const permissions = useCollectionPermissions('entitlements', ['assignSeat']);
  const [pending, setPending] = useState<ItamRecord>();
  const reclaim = useMutation({
    mutationFn: async (seat: ItamRecord) =>
      api.request({
        path: `${ENTITLEMENTS_PATH}/${text(seat.entitlementId)}/reclaim-seats`,
        method: 'POST',
        json: { seatIds: [text(seat.id)] },
      }),
    onSuccess: async (_data, seat) => {
      setPending(undefined);
      await announce(
        t('people.recovery.toast.reclaimed', { label: text(seat.name) }),
        holderType === 'person' ? [holderId] : [],
      );
    },
  });
  const rows = seats.data ?? [];
  const paged = usePagedRows(rows);
  const names = useReferenceNames([
    {
      collection: 'softwareProducts',
      ids: rows.map((row) => text(row.softwareProductId)).filter(Boolean),
    },
    {
      collection: 'categories',
      ids: rows.map((row) => text(row.categoryId)).filter(Boolean),
    },
  ]);
  if (seats.data && rows.length === 0)
    return <EmptyState title={t('entitlements.noneHeld')} />;
  const device = holderType === 'device';
  // A device holds perpetual seats only: name, product, category, kind and
  // the date, with reclaim on the row. A person's list keeps the account
  // and last use of subscription seats.
  return (
    <>
      <DataTable
        columns={[
          {
            key: 'name',
            header: t('fields.name'),
            render: (row) => (
              <RecordLink
                to={`/entitlements/${text(row.entitlementId)}`}
                className='font-medium underline-offset-4 hover:underline'
              >
                {text(row.name)}
              </RecordLink>
            ),
          },
          ...(device
            ? [
                {
                  key: 'softwareProductId',
                  header: t('fields.softwareProduct'),
                  className: 'w-px whitespace-nowrap',
                  render: (row: ItamRecord) => (
                    <ReferenceLink
                      collection='softwareProducts'
                      route='software-products'
                      id={row.softwareProductId}
                      names={names.softwareProducts}
                    />
                  ),
                },
                {
                  key: 'categoryId',
                  header: t('fields.category'),
                  className: 'w-px whitespace-nowrap',
                  render: (row: ItamRecord) => (
                    <ReferenceLink
                      collection='categories'
                      route='categories'
                      id={row.categoryId}
                      names={names.categories}
                    />
                  ),
                },
              ]
            : []),
          {
            key: 'kind',
            header: t('fields.entitlementKind'),
            className: 'w-px whitespace-nowrap',
            render: (row) => t(`enums.entitlementKind.${text(row.kind)}`),
          },
          // A person's seat is an account on the vendor's console; a
          // device's is not.
          ...(device
            ? []
            : [
                {
                  key: 'account',
                  header: t('fields.account'),
                  render: (row: ItamRecord) => text(row.account) || '—',
                },
              ]),
          {
            key: 'assignedAt',
            header: t('entitlements.grantedAt'),
            className: 'w-px whitespace-nowrap',
            render: (row: ItamRecord) => formatDate(row.assignedAt),
          },
        ]}
        rows={paged.rows}
        pagination={paged.pagination}
        loading={seats.isLoading}
        onRowClick={(row) =>
          openRecord(`/entitlements/${text(row.entitlementId)}`)
        }
        rowActions={
          device && permissions.assignSeat
            ? (row) => (
                <Button
                  variant='outline'
                  disabled={reclaim.isPending}
                  onClick={() => {
                    reclaim.reset();
                    setPending(row);
                  }}
                >
                  <Undo2 data-icon='inline-start' />
                  {t('entitlements.reclaimSeat')}
                </Button>
              )
            : undefined
        }
      />
      <ConfirmDialog
        open={Boolean(pending)}
        onOpenChange={(open) => !open && setPending(undefined)}
        title={t('entitlements.reclaimSeat')}
        busy={reclaim.isPending}
        error={reclaim.error}
        confirmLabel={t('entitlements.reclaimSeat')}
        onConfirm={() => pending && reclaim.mutate(pending)}
      >
        {pending ? (
          <div className='text-sm'>
            <span className='font-medium'>{text(pending.name)}</span>
          </div>
        ) : null}
      </ConfirmDialog>
    </>
  );
}
