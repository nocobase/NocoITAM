import { useTranslation } from '@nocobase/i18n/client';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { AssetTypeBadge } from '@/components/itam/asset-type-badge';
import { DataTable, type DataTableColumn } from '@/components/itam/data-table';
import { EmptyState } from '@/components/itam/empty-state';
import { Page, PageHeader } from '@/components/itam/page-header';
import {
  ProposedOrdersButton,
  type ProposedOrder,
} from '@/components/itam/proposed-orders-button';
import { RecordLink } from '@/components/itam/record-link';
import { SegmentedControl } from '@/components/itam/segmented-control';
import { Switch } from '@/components/ui/switch';
import { formatDate, todayIso } from '@/lib/itam/format';
import { TARGET_ROUTES } from '@/lib/itam/onboarding';
import type { LineItemType } from '@/lib/itam/procurement';
import {
  DEMAND_SOURCES,
  SUPPLY_HORIZONS,
  SUPPLY_SOURCES,
  useSupplyDemand,
  type SupplyRow,
} from '@/lib/itam/supply-demand';
import { cn } from '@/lib/utils';

type Row = SupplyRow & { readonly id: string };
type Show = 'short' | 'all';

/** Whether a row is short and can be bought: a model or a product. */
const buyable = (row: SupplyRow) =>
  row.balance !== null &&
  row.balance < 0 &&
  row.itemType !== null &&
  row.target.type !== 'category';

/**
 * 供需分析 (2026-10-23): for every item the register keeps — device and
 * stock models, software products' seats — what comes in over the next
 * days (stock, open purchase orders, repairs coming back, what leavers hand
 * back) against what goes out (joiners' kits, stock minimums, subscriptions
 * ending unrenewed, and replacements when asked), and the balance; short,
 * the last day to order it. What is short is bought here, in the purchase
 * order's create dialog filled in, an order per vendor it was last bought
 * from — the joiners' cards and the workbench no longer buy. A row opens to
 * the records behind each number.
 */
export default function SupplyDemandPage(): ReactElement {
  const { t } = useTranslation();
  const [days, setDays] = useState<number>(60);
  const [replacements, setReplacements] = useState(false);
  const [show, setShow] = useState<Show>('all');
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const result = useSupplyDemand(days, replacements);
  const rows: readonly Row[] | undefined = result.data?.rows
    .filter((row) => show === 'all' || (row.balance ?? 0) < 0)
    .map((row) => ({ ...row, id: row.key }));
  const short = (result.data?.rows ?? []).filter(buyable);
  const today = todayIso();

  /** An order per vendor last bought from, for these rows. */
  const ordersFor = (picked: readonly SupplyRow[]): ProposedOrder[] => {
    const groups = new Map<string, SupplyRow[]>();
    for (const row of picked.filter(buyable)) {
      const key = row.vendorId ?? '';
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    return [...groups].map(([vendorId, group]) => {
      const needs = group.flatMap((row) =>
        row.entries.filter((entry) => entry.quantity < 0),
      );
      // Joiners alone: 新员工配备; replacements alone: 批量更换; else 补库存.
      const reason = needs.every((entry) => entry.kind === 'joiner')
        ? 'newHire'
        : needs.every((entry) => entry.kind === 'replacement')
          ? 'batchReplacement'
          : 'stockReplenishment';
      const neededBy = needs
        .map((entry) => entry.date)
        .filter((date): date is string => Boolean(date))
        .sort()[0];
      const names = group.map((row) => row.target.name);
      return {
        key: vendorId || 'none',
        title:
          names.length > 2
            ? t('supplyDemand.orders.titleMany', {
                items: names.slice(0, 2).join(t('common.listSeparator')),
                count: names.length,
              })
            : names.join(t('common.listSeparator')),
        values: {
          reason,
          description: t('supplyDemand.orders.description', {
            items: names.join(t('common.listSeparator')),
          }),
          ...(vendorId ? { vendorId } : {}),
          ...(neededBy ? { neededBy: neededBy.slice(0, 10) } : {}),
        },
        lines: group.map((row) => ({
          itemType: row.itemType as LineItemType,
          modelId: row.target.type === 'model' ? row.target.id : null,
          softwareProductId:
            row.target.type === 'softwareProduct' ? row.target.id : null,
          quantity: -(row.balance ?? 0),
        })),
      };
    });
  };

  const count = (value: number) =>
    value === 0 ? (
      <span className='text-muted-foreground'>—</span>
    ) : (
      <span className='tabular-nums'>{Math.abs(value)}</span>
    );

  const columns: DataTableColumn<Row>[] = [
    {
      key: 'item',
      header: t('supplyDemand.columns.item'),
      contentClassName: 'max-w-none',
      render: (row) => (
        <span className='flex min-w-0 items-center gap-2'>
          {open.has(row.key) ? (
            <ChevronDown className='size-4 shrink-0 text-muted-foreground' />
          ) : (
            <ChevronRight className='size-4 shrink-0 text-muted-foreground' />
          )}
          <AssetTypeBadge value={row.kind} className='shrink-0' />
          <RecordLink
            to={`/${TARGET_ROUTES[row.target.type]}/${row.target.id}`}
            className='truncate'
            onClick={(event) => event.stopPropagation()}
          >
            {row.target.name}
          </RecordLink>
        </span>
      ),
    },
    ...SUPPLY_SOURCES.map((source): DataTableColumn<Row> => ({
      key: source,
      header: t(`supplyDemand.sources.${source}`),
      className: 'text-right',
      render: (row) => count(row.totals[source]),
    })),
    {
      key: 'demand',
      header: t('supplyDemand.columns.demand'),
      className: 'text-right',
      render: (row) => count(row.demand),
    },
    {
      key: 'balance',
      header: t('supplyDemand.columns.balance'),
      className: 'text-right',
      render: (row) =>
        row.balance === null ? (
          <span className='text-muted-foreground'>
            {t('supplyDemand.unlimited')}
          </span>
        ) : (
          <span
            className={cn(
              'font-medium tabular-nums',
              row.balance < 0 && 'text-destructive',
            )}
          >
            {row.balance > 0 ? `+${String(row.balance)}` : row.balance}
          </span>
        ),
    },
    {
      key: 'orderBy',
      header: t('supplyDemand.columns.orderBy'),
      render: (row) =>
        row.orderBy ? (
          <span
            className={cn(
              'tabular-nums',
              row.orderBy < today ? 'text-destructive' : 'text-warning-foreground',
            )}
          >
            {row.orderBy < today
              ? t('supplyDemand.orderNow', { date: formatDate(row.orderBy) })
              : formatDate(row.orderBy)}
          </span>
        ) : (
          <span className='text-muted-foreground'>—</span>
        ),
    },
  ];

  return (
    <Page>
      <PageHeader
        title={t('supplyDemand.title')}
        description={t('supplyDemand.description')}
        actions={
          short.length > 0 ? (
            <ProposedOrdersButton orders={() => ordersFor(short)}>
              {t('supplyDemand.orders.createAll', { count: short.length })}
            </ProposedOrdersButton>
          ) : undefined
        }
      />
      <div className='flex flex-wrap items-center gap-3'>
        <SegmentedControl
          value={String(days)}
          onChange={(value) => setDays(Number(value))}
          label={t('supplyDemand.horizon')}
          options={SUPPLY_HORIZONS.map((value) => ({
            value: String(value),
            label: t('supplyDemand.days', { count: value }),
          }))}
        />
        <SegmentedControl<Show>
          value={show}
          onChange={setShow}
          label={t('supplyDemand.show')}
          options={[
            { value: 'all', label: t('supplyDemand.showAll') },
            {
              value: 'short',
              label: t('supplyDemand.showShort', {
                count: (result.data?.rows ?? []).filter(
                  (row) => (row.balance ?? 0) < 0,
                ).length,
              }),
            },
          ]}
        />
        <label className='flex items-center gap-2 text-sm'>
          <Switch
            checked={replacements}
            onCheckedChange={(checked) => setReplacements(checked)}
          />
          <span className='text-muted-foreground'>
            {t('supplyDemand.replacements')}
          </span>
        </label>
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        loading={result.isFetching}
        error={result.error}
        empty={
          <EmptyState
            title={t(
              show === 'short' ? 'supplyDemand.noShort' : 'supplyDemand.empty',
            )}
          />
        }
        onRowClick={(row) =>
          setOpen((current) => {
            const next = new Set(current);
            if (next.has(row.key)) next.delete(row.key);
            else next.add(row.key);
            return next;
          })
        }
        rowActions={(row) =>
          buyable(row) ? (
            <ProposedOrdersButton
              className='text-sm'
              orders={() => ordersFor([row])}
            />
          ) : null
        }
        subRow={(row) => (open.has(row.key) ? <Entries row={row} /> : null)}
      />
    </Page>
  );
}

/** The records behind a row's numbers: what comes in, then what goes out. */
function Entries({ row }: { readonly row: SupplyRow }): ReactElement {
  const { t } = useTranslation();
  const groups = [...SUPPLY_SOURCES, ...DEMAND_SOURCES]
    .map((source) => ({
      source,
      entries: row.entries.filter((entry) => entry.kind === source),
    }))
    .filter((group) => group.entries.length > 0);
  return (
    <dl className='grid gap-x-6 gap-y-1.5 py-1 pl-6 text-sm sm:grid-cols-[8rem_1fr]'>
      {groups.map(({ source, entries }) => (
        <div key={source} className='contents'>
          <dt className='text-muted-foreground'>
            {t(`supplyDemand.sources.${source}`)}
          </dt>
          <dd className='flex flex-wrap gap-x-4 gap-y-1'>
            {entries.map((entry, at) => (
              <span
                key={`${entry.url ?? ''}:${String(at)}`}
                className='inline-flex items-baseline gap-1.5'
              >
                {entry.url ? (
                  <RecordLink to={entry.url}>
                    {entry.label || row.target.name}
                  </RecordLink>
                ) : (
                  <span>{entry.label}</span>
                )}
                <span
                  className={cn(
                    'tabular-nums',
                    entry.quantity < 0
                      ? 'text-destructive'
                      : 'text-muted-foreground',
                  )}
                >
                  {entry.quantity > 0
                    ? `+${String(entry.quantity)}`
                    : entry.quantity}
                </span>
                {entry.date ? (
                  <span className='text-xs text-muted-foreground tabular-nums'>
                    {formatDate(entry.date)}
                  </span>
                ) : null}
              </span>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}
