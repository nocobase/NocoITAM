import { useTranslation } from '@nocobase/i18n/client';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Fragment, useState, type ReactElement, type ReactNode } from 'react';

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
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { formatDate, todayIso } from '@/lib/itam/format';
import { TARGET_ROUTES } from '@/lib/itam/onboarding';
import type { LineItemType } from '@/lib/itam/procurement';
import {
  SUPPLY_HORIZONS,
  useSupplyDemand,
  type SupplyEntry,
  type SupplyRow,
} from '@/lib/itam/supply-demand';
import { cn } from '@/lib/utils';

type Row = SupplyRow & { readonly id: string };

/** Whether a row is short: below its minimum once all is counted. */
const isShort = (row: SupplyRow) => row.balance !== null && row.balance < 0;

/** Short and can be bought: a model or a product, not a category. */
const buyable = (row: SupplyRow) =>
  isShort(row) && row.itemType !== null && row.target.type !== 'category';

const KIND_ORDER = [
  'device',
  'accessory',
  'consumable',
  'component',
  'entitlement',
];
const kindOrder = (row: SupplyRow) => {
  const at = KIND_ORDER.indexOf(row.kind);
  return at === -1 ? KIND_ORDER.length : at;
};

/** What a row's numbers come to, in the words the page uses. */
function figures(row: SupplyRow) {
  const { totals } = row;
  const have = totals.stock;
  const coming = totals.order + totals.repair + totals.return;
  const using = -(totals.joiner + totals.expiring + totals.replacement);
  return {
    have,
    coming,
    using,
    left: have + coming - using,
    minimum: -totals.minimum,
  };
}

/**
 * 供需分析 (2026-10-23): whether each item — device and stock models,
 * software products' seats — is enough for the next days, and when to order
 * what is not.
 *
 * Read first as 不够用 (2026-10-23, the same day: one table of every item and
 * a column per source was not readable — most rows changed nothing, and a
 * minimum counted as a need): each short item says in words what needs it,
 * what there is, how many are missing and the last day to order, with
 * 创建采购单. Then 够用, every other model and software product (only those
 * with something coming or going until the user asked for all, the same
 * day), as 现有 + 将到 − 将用 = 剩余, the minimum beside it; a
 * row opens to the records behind its numbers.
 */
export default function SupplyDemandPage(): ReactElement {
  const { t } = useTranslation();
  const [days, setDays] = useState<number>(60);
  const [replacements, setReplacements] = useState(false);
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const result = useSupplyDemand(days, replacements);
  const all = result.data?.rows ?? [];
  const short = all.filter(isShort);
  // By type as the menu lists them, then by name (2026-10-23); what is
  // short keeps its most pressing first.
  const enough = all
    .filter((row) => !isShort(row))
    .sort(
      (a, b) =>
        kindOrder(a) - kindOrder(b) ||
        a.target.name.localeCompare(b.target.name),
    );
  const rows: readonly Row[] | undefined = result.data
    ? enough.map((row) => ({ ...row, id: row.key }))
    : undefined;

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
      <span className='tabular-nums'>{value}</span>
    );
  const numeric = (
    key: string,
    header: string,
    value: (row: Row) => ReactNode,
  ): DataTableColumn<Row> => ({
    key,
    header,
    className: 'w-24 text-right',
    render: value,
  });
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
          <ItemName row={row} />
        </span>
      ),
    },
    {
      key: 'category',
      header: t('supplyDemand.columns.category'),
      render: (row) => <CategoryLink row={row} />,
    },
    numeric('have', t('supplyDemand.columns.have'), (row) =>
      count(figures(row).have),
    ),
    numeric('coming', t('supplyDemand.columns.coming'), (row) =>
      count(figures(row).coming),
    ),
    numeric('using', t('supplyDemand.columns.using'), (row) =>
      count(figures(row).using),
    ),
    numeric('left', t('supplyDemand.columns.left'), (row) =>
      row.balance === null ? (
        <span className='text-muted-foreground'>
          {t('supplyDemand.unlimited')}
        </span>
      ) : (
        <span className='font-medium tabular-nums'>{figures(row).left}</span>
      ),
    ),
    numeric('minimum', t('supplyDemand.columns.minimum'), (row) =>
      count(figures(row).minimum),
    ),
  ];

  return (
    <Page>
      <PageHeader
        title={t('supplyDemand.title')}
        description={t('supplyDemand.description')}
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

      {result.isLoading ? (
        <Skeleton className='h-40 w-full rounded-xl' />
      ) : (
        <>
          <section className='space-y-2'>
            <div className='flex min-h-8 flex-wrap items-center justify-between gap-2'>
              <h2 className='text-base font-semibold'>
                {short.length > 0
                  ? t('supplyDemand.short.title', {
                      count: short.length,
                      days,
                    })
                  : t('supplyDemand.short.none', { days })}
              </h2>
              {short.filter(buyable).length > 1 ? (
                <ProposedOrdersButton orders={() => ordersFor(short)}>
                  {t('supplyDemand.orders.createAll')}
                </ProposedOrdersButton>
              ) : null}
            </div>
            {short.length > 0 ? (
              <Card className='py-0'>
                <CardContent className='divide-y divide-border/60 px-4 py-0'>
                  {short.map((row) => (
                    <ShortItem
                      key={row.key}
                      row={row}
                      action={
                        buyable(row) ? (
                          <ProposedOrdersButton
                            orders={() => ordersFor([row])}
                          />
                        ) : null
                      }
                    />
                  ))}
                </CardContent>
              </Card>
            ) : null}
          </section>

          <section className='space-y-2'>
            <div className='flex min-h-8 flex-wrap items-center justify-between gap-2'>
              <h2 className='text-base font-semibold'>
                {t('supplyDemand.enough.title', { count: enough.length })}
              </h2>
            </div>
            <p className='text-xs text-muted-foreground'>
              {t('supplyDemand.enough.hint')}
            </p>
            <DataTable
              columns={columns}
              rows={rows}
              loading={result.isFetching}
              error={result.error}
              empty={<EmptyState title={t('supplyDemand.enough.empty')} />}
              onRowClick={(row) =>
                setOpen((current) => {
                  const next = new Set(current);
                  if (next.has(row.key)) next.delete(row.key);
                  else next.add(row.key);
                  return next;
                })
              }
              subRow={(row) =>
                open.has(row.key) ? (
                  <div className='space-y-1 py-1 pl-6 text-sm'>
                    <Explained row={row} />
                  </div>
                ) : null
              }
            />
          </section>
        </>
      )}
    </Page>
  );
}

/** The item's type tag and its name, opening its model or product. */
function ItemName({
  row,
  withCategory = false,
}: {
  readonly row: SupplyRow;
  /** Its category after the name, where there is no column for it. */
  readonly withCategory?: boolean;
}): ReactElement {
  return (
    <span className='flex min-w-0 items-center gap-2'>
      <AssetTypeBadge value={row.kind} className='shrink-0' />
      <RecordLink
        to={`/${TARGET_ROUTES[row.target.type]}/${row.target.id}`}
        className='truncate'
        onClick={(event) => event.stopPropagation()}
      >
        {row.target.name}
      </RecordLink>
      {withCategory && row.category ? (
        <span className='shrink-0 text-xs text-muted-foreground'>
          {row.category.name}
        </span>
      ) : null}
    </span>
  );
}

/** A row's category, opening it. */
function CategoryLink({ row }: { readonly row: SupplyRow }): ReactElement {
  return row.category ? (
    <RecordLink
      to={`/categories/${row.category.id}`}
      className='text-muted-foreground'
      onClick={(event) => event.stopPropagation()}
    >
      {row.category.name}
    </RecordLink>
  ) : (
    <span className='text-muted-foreground'>—</span>
  );
}

/** A short item: how many are missing, by when to order, and why. */
function ShortItem({
  row,
  action,
}: {
  readonly row: SupplyRow;
  readonly action: ReactNode;
}): ReactElement {
  const { t } = useTranslation();
  const today = todayIso();
  const late = row.orderBy !== null && row.orderBy <= today;
  return (
    <div className='space-y-1.5 py-3 text-sm'>
      <div className='flex flex-wrap items-center gap-x-3 gap-y-1'>
        <span className='min-w-0 flex-1 basis-48'>
          <ItemName row={row} withCategory />
        </span>
        <span className='font-medium text-destructive tabular-nums'>
          {t('supplyDemand.short.missing', { count: -(row.balance ?? 0) })}
        </span>
        {row.orderBy ? (
          <span
            className={cn(
              'tabular-nums',
              late ? 'text-destructive' : 'text-warning-foreground',
            )}
          >
            {row.orderBy < today
              ? t('supplyDemand.short.orderByPassed', {
                  date: formatDate(row.orderBy),
                })
              : row.orderBy === today
                ? t('supplyDemand.short.orderToday')
                : t('supplyDemand.short.orderBy', {
                    date: formatDate(row.orderBy),
                  })}
          </span>
        ) : null}
        {action}
      </div>
      <Explained row={row} />
    </div>
  );
}

/** 要用 and 现有 in words: each record behind the numbers. */
function Explained({ row }: { readonly row: SupplyRow }): ReactElement {
  const { t } = useTranslation();
  const needs = row.entries.filter((entry) => entry.quantity < 0);
  const has = row.entries.filter((entry) => entry.quantity > 0);
  const line = (
    label: string,
    entries: readonly SupplyEntry[],
    none: string,
    lead: ReactNode = null,
  ) => (
    <p className='flex gap-2'>
      <span className='w-10 shrink-0 text-muted-foreground'>{label}</span>
      <span className='min-w-0 flex-1'>
        {lead}
        {entries.length === 0 ? (
          lead ? null : (
            <span className='text-muted-foreground'>{none}</span>
          )
        ) : (
          entries.map((entry, at) => (
            <Fragment key={`${entry.kind}:${entry.url ?? ''}:${String(at)}`}>
              {at > 0 || lead ? (
                <span className='text-muted-foreground'>
                  {t('common.listSeparator')}
                </span>
              ) : null}
              <EntryText entry={entry} row={row} />
            </Fragment>
          ))
        )}
      </span>
    </p>
  );
  // Seats not counted: say which entitlement, rather than a bare 不限.
  const unlimited = row.unlimitedBy ? (
    <span>
      <RecordLink to={row.unlimitedBy.url} className='text-foreground'>
        {row.unlimitedBy.label}
      </RecordLink>{' '}
      {t('supplyDemand.entry.unlimited')}
    </span>
  ) : null;
  return (
    <div className='space-y-1 text-muted-foreground'>
      {line(
        t('supplyDemand.explain.needs'),
        needs,
        t('supplyDemand.explain.noNeeds'),
      )}
      {line(
        t('supplyDemand.explain.has'),
        compact(has),
        t('supplyDemand.explain.nothing'),
        unlimited,
      )}
    </div>
  );
}

/**
 * Stock in one sum (a device per entry would list every one in stock);
 * everything else, record by record.
 */
function compact(entries: readonly SupplyEntry[]): SupplyEntry[] {
  const stock = entries.filter((entry) => entry.kind === 'stock');
  const sum = stock.reduce((total, entry) => total + entry.quantity, 0);
  return [
    ...(sum > 0
      ? [
          {
            kind: 'stock' as const,
            quantity: sum,
            label: '',
            date: null,
            url: stock.length === 1 ? (stock[0]?.url ?? null) : null,
          },
        ]
      : []),
    ...entries.filter((entry) => entry.kind !== 'stock'),
  ];
}

/** One record behind a number, as a phrase: 孙浩 10-28 入职 ×1. */
function EntryText({
  entry,
  row,
}: {
  readonly entry: SupplyEntry;
  readonly row: SupplyRow;
}): ReactElement {
  const { t } = useTranslation();
  const count = Math.abs(entry.quantity);
  const date = entry.date ? formatDate(entry.date) : '';
  const name = entry.url ? (
    <RecordLink to={entry.url} className='text-foreground'>
      {entry.label || row.target.name}
    </RecordLink>
  ) : (
    <span className='text-foreground'>{entry.label}</span>
  );
  // An order and a lapsing subscription say how many; the rest are one
  // record each, ×N only for a person's several.
  const text = (key: string) =>
    key === 'order' || key === 'expiring'
      ? t(`supplyDemand.entry.${key}${date ? 'Dated' : ''}`, {
          date,
          number: count,
        })
      : `${t(`supplyDemand.entry.${key}`, { date })}${count > 1 ? ` ×${String(count)}` : ''}`;
  switch (entry.kind) {
    case 'stock':
      return (
        <span className='text-foreground'>
          {row.kind === 'entitlement'
            ? t('supplyDemand.entry.freeSeats', { number: count })
            : t('supplyDemand.entry.inStock', { number: count })}
        </span>
      );
    case 'minimum':
      return (
        <span className='text-foreground'>
          {t('supplyDemand.entry.minimum', { number: count })}
        </span>
      );
    default:
      return (
        <span>
          {name} {text(entry.kind)}
        </span>
      );
  }
}
