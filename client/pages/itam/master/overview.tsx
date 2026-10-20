import { AssetTypeBadge } from '@/components/itam/asset-type-badge';
import { useTranslation } from '@nocobase/i18n/client';
import {
  AppWindow,
  ArrowDown,
  ArrowUp,
  Check,
  Building2,
  Cpu,
  Factory,
  FolderTree,
  KeyRound,
  MapPin,
  MonitorSmartphone,
  Mouse,
  Package,
  Printer,
  Recycle,
  ShoppingCart,
  Store,
  Users,
  Wrench,
} from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { Link } from 'react-router';

import { Page, PageHeader } from '@/components/itam/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { masterDataPath, useItamList, type ItamRecord } from '@/lib/itam/api';
import { DEVICES_PATH } from '@/lib/itam/device-api';
import { ENTITLEMENTS_PATH } from '@/lib/itam/entitlements';
import { PURCHASE_ORDERS_PATH } from '@/lib/itam/procurement';
import { DISPOSALS_PATH, REPAIRS_PATH } from '@/lib/itam/operations';
import { STOCK_PATH } from '@/lib/itam/stock';
import { cn } from '@/lib/utils';

type Icon = typeof FolderTree;

/** A node of the map: a master-data collection or the records built on it. */
interface Node {
  readonly key: string;
  readonly icon: Icon;
  readonly label: string;
  readonly to: string;
  /** Where the count comes from; a list's `total` with one row. */
  readonly path?: string;
  readonly filter?: Record<string, string>;
  /** Master data (solid) or the business records it describes (dashed). */
  readonly kind: 'master' | 'record';
}

/** The five device types, each with the node holding its records. */
const KINDS = [
  { value: 'device', record: 'devices' },
  { value: 'accessory', record: 'accessories' },
  { value: 'consumable', record: 'consumables' },
  { value: 'component', record: 'components' },
  { value: 'entitlement', record: 'entitlements' },
] as const;

/** Who may hold each device type: the assignment rules the services enforce. */
const ASSIGNEES: readonly {
  key: string;
  label: string;
  holds: readonly string[];
}[] = [
  {
    key: 'person',
    label: 'navigation.people',
    holds: ['device', 'accessory', 'consumable', 'entitlement'],
  },
  {
    key: 'location',
    label: 'navigation.locations',
    holds: ['device', 'accessory', 'consumable'],
  },
  {
    key: 'device',
    // Accessories go to people or locations only; what sits on a device
    // is a component (or another device).
    label: 'masterData.assigneeDevice',
    holds: ['device', 'component', 'entitlement'],
  },
];

/**
 * The master-data landing page: how the eight collections relate to each
 * other and to the records built on them, with live counts, and the order
 * to set them up in.
 */
export default function MasterDataOverviewPage(): ReactElement {
  const { t } = useTranslation();
  const master = (key: string, icon: Icon): Node => ({
    key,
    icon,
    label: t(`navigation.${key}`),
    to: `/${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`,
    path: masterDataPath(key),
    kind: 'master',
  });
  const record = (
    key: string,
    icon: Icon,
    label: string,
    to: string,
    path: string,
    filter?: Record<string, string>,
  ): Node => ({ key, icon, label, to, path, filter, kind: 'record' });

  const nodes = {
    manufacturers: master('manufacturers', Factory),
    categories: master('categories', FolderTree),
    models: master('models', Package),
    softwareProducts: master('softwareProducts', AppWindow),
    devices: record(
      'devices',
      MonitorSmartphone,
      t('navigation.devices'),
      '/devices',
      DEVICES_PATH,
    ),
    accessories: record(
      'accessories',
      Mouse,
      t('navigation.accessories'),
      '/accessories',
      STOCK_PATH,
      { kind: 'accessory' },
    ),
    consumables: record(
      'consumables',
      Printer,
      t('navigation.consumables'),
      '/consumables',
      STOCK_PATH,
      { kind: 'consumable' },
    ),
    components: record(
      'components',
      Cpu,
      t('navigation.components'),
      '/components',
      STOCK_PATH,
      { kind: 'component' },
    ),
    entitlements: record(
      'entitlements',
      KeyRound,
      t('entitlements.object'),
      '/entitlements',
      ENTITLEMENTS_PATH,
    ),
    locations: master('locations', MapPin),
    departments: master('departments', Building2),
    people: master('people', Users),
    vendors: master('vendors', Store),
    purchaseOrders: record(
      'purchaseOrders',
      ShoppingCart,
      t('navigation.procurement'),
      '/procurement',
      PURCHASE_ORDERS_PATH,
    ),
    repairs: record(
      'repairs',
      Wrench,
      t('navigation.repairs'),
      '/repairs',
      REPAIRS_PATH,
    ),
    // A vendor also takes scrapped devices: a disposal's 接收方（供应商）.
    disposals: record(
      'disposals',
      Recycle,
      t('navigation.disposals'),
      '/disposals',
      DISPOSALS_PATH,
    ),
  };

  return (
    <Page>
      <PageHeader title={t('masterData.overviewTitle')} />
      {/* Laid out by the page's own width (`Page` is a container), not the
          window's: the assistant's panel narrows the page (2026-10-20). */}
      <div className='grid gap-6 @4xl:grid-cols-2'>
        <Lane
          title={t('masterData.laneWhat')}
          hint={t('masterData.laneWhatHint')}
          className='@4xl:col-span-2'
        >
          {/* One column per device type, read from the records upwards: the
              records, the categories of that type, then what the records
              are instances of, then who makes those. */}
          {/* Narrower than its five columns can take, it scrolls sideways
              rather than cut the names short. */}
          <div className='-mx-4 overflow-x-auto px-4'>
            <div className='grid min-w-[28rem] grid-cols-[4.75rem_repeat(5,minmax(0,1fr))] items-stretch gap-x-1.5 gap-y-2 @3xl:gap-x-2 @3xl:grid-cols-[7rem_repeat(5,minmax(0,1fr))]'>
              <RowLabel>{t('masterData.rowGrain')}</RowLabel>
              {(
                [
                  {
                    label: t('tabs.devices'),
                    hint: t('masterData.grainDevice'),
                    span: 'col-span-1',
                  },
                  {
                    label: t('tabs.stock'),
                    hint: t('masterData.grainStock'),
                    span: 'col-span-3',
                  },
                  {
                    label: t('entitlements.object'),
                    hint: t('masterData.grainEntitlement'),
                    span: 'col-span-1',
                  },
                ] as const
              ).map((grain) => (
                <div
                  key={grain.label}
                  className={cn('px-3 text-center', grain.span)}
                >
                  <div className='text-xs font-medium'>{grain.label}</div>
                  <div className='text-xs text-muted-foreground'>
                    {grain.hint}
                  </div>
                  {grain.span !== 'col-span-1' ? (
                    // A bracket over the columns this granularity spans.
                    <div className='mx-6 mt-1 h-2 rounded-t-sm border-t border-r border-l border-border' />
                  ) : null}
                </div>
              ))}
              <RowLabel>{t('masterData.rowKinds')}</RowLabel>
              {KINDS.map((kind) => (
                <NodeCard key={kind.value} node={nodes[kind.record]} compact />
              ))}
              <ArrowRow
                cells={KINDS.map((kind) => ({
                  key: kind.value,
                  label: t('masterData.edgeDividesInto'),
                  span: 'col-span-1',
                }))}
              />
              <RowLabel>{t('masterData.rowCategory')}</RowLabel>
              {KINDS.map((kind) => (
                <NodeCard
                  key={kind.value}
                  node={{
                    ...nodes.categories,
                    to: `/categories?appliesTo=${kind.value}`,
                    filter: { appliesTo: kind.value },
                  }}
                  compact
                />
              ))}
              <ArrowRow
                cells={KINDS.map((kind) => ({
                  key: kind.value,
                  label: t('masterData.edgeContains'),
                  span: 'col-span-1',
                }))}
              />
              <RowLabel>{t('masterData.rowModel')}</RowLabel>
              <div className='col-span-4'>
                <NodeCard node={nodes.models} compact />
              </div>
              <NodeCard node={nodes.softwareProducts} compact />
              <ArrowRow
                cells={[
                  {
                    key: 'models',
                    label: t('masterData.edgeMadeBy'),
                    span: 'col-span-4',
                  },
                  {
                    key: 'softwareProducts',
                    label: t('masterData.edgeMadeBy'),
                    span: 'col-span-1',
                  },
                ]}
              />
              <RowLabel>{t('masterData.rowManufacturer')}</RowLabel>
              <div className='col-span-5'>
                <NodeCard node={nodes.manufacturers} compact />
              </div>
            </div>
          </div>
        </Lane>
        <Lane
          title={t('masterData.laneWhere')}
          hint={t('masterData.laneWhereHint')}
        >
          <div className='grid grid-cols-3 gap-x-2 gap-y-2'>
            <NodeCard node={nodes.departments} compact />
            <div className='col-span-2'>
              <NodeCard node={nodes.locations} compact />
            </div>
            {/* Read upwards: a person belongs to a department and has an
                office location; a device or a stock record is kept at a
                location (its 存放位置, 2026-10-20), whoever holds it. */}
            <Arrow label={t('masterData.edgeBelongsTo')} centered up />
            <Arrow label={t('fields.officeLocation')} centered up />
            <Arrow label={t('masterData.edgeStoredAt')} centered up />
            <div className='col-span-2'>
              <NodeCard node={nodes.people} compact />
            </div>
            <NodeCard
              node={{
                key: 'stored',
                icon: Package,
                label: t('masterData.storedAssets'),
                to: '/devices',
                kind: 'record',
              }}
              compact
            />
          </div>
          {/* Who may hold what: assignees down, device types across. */}
          <div className='-mx-4 mt-6 overflow-x-auto px-4'>
            <table className='w-full min-w-[26rem] text-sm'>
              <thead>
                <tr className='text-xs text-muted-foreground'>
                  <th className='py-1 text-left font-normal'>
                    {t('masterData.assigneeHeader')}
                  </th>
                  {KINDS.map((kind) => (
                    <th
                      key={kind.value}
                      className='py-1 text-center font-normal'
                    >
                      <AssetTypeBadge value={kind.value} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ASSIGNEES.map((assignee) => (
                  <tr key={assignee.key} className='border-t border-border'>
                    <td className='py-1.5 font-medium'>{t(assignee.label)}</td>
                    {KINDS.map((kind) => (
                      <td key={kind.value} className='py-1.5 text-center'>
                        {assignee.holds.includes(kind.value) ? (
                          <Check className='mx-auto size-4 text-foreground' />
                        ) : (
                          <span className='text-muted-foreground/50'>–</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Lane>
        <Lane
          title={t('masterData.laneWho')}
          hint={t('masterData.laneWhoHint')}
        >
          <div className='grid grid-cols-3 gap-2'>
            <div className='col-span-3'>
              <NodeCard node={nodes.vendors} compact />
            </div>
            <Arrow label={t('masterData.edgeUndertakes')} centered />
            <Arrow label={t('masterData.edgeUndertakes')} centered />
            <Arrow label={t('masterData.edgeUndertakes')} centered />
            <NodeCard node={nodes.purchaseOrders} compact />
            <NodeCard node={nodes.repairs} compact />
            <NodeCard node={nodes.disposals} compact />
          </div>
        </Lane>
      </div>
      <Card className='py-0'>
        <CardContent className='space-y-3 p-4'>
          <h2 className='font-heading text-base font-semibold'>
            {t('masterData.setupOrder')}
          </h2>
          <ol className='flex flex-wrap items-center gap-x-2 gap-y-2 text-sm'>
            {(
              [
                ['manufacturers', 'vendors'],
                ['categories'],
                ['models', 'softwareProducts'],
                ['locations', 'departments'],
                ['people'],
              ] as const
            ).map((step, index, steps) => (
              <li key={step.join('+')} className='flex items-center gap-2'>
                <span className='flex size-5 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums'>
                  {index + 1}
                </span>
                {step.map((key, i) => (
                  <span key={key} className='flex items-center gap-2'>
                    {i > 0 ? (
                      <span className='text-muted-foreground'>·</span>
                    ) : null}
                    <Link
                      to={nodes[key].to}
                      className='text-link underline-offset-4 hover:underline'
                    >
                      {nodes[key].label}
                    </Link>
                  </span>
                ))}
                {index < steps.length - 1 ? (
                  <span className='px-1 text-muted-foreground'>→</span>
                ) : null}
              </li>
            ))}
          </ol>
          <p className='text-xs text-muted-foreground'>
            {t('masterData.setupSeeded')}
          </p>
        </CardContent>
      </Card>
    </Page>
  );
}

function Lane({
  title,
  hint,
  className,
  children,
}: {
  readonly title: string;
  readonly hint: string;
  readonly className?: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <Card className={cn('py-0', className)}>
      <CardContent className='space-y-3 p-4'>
        <div>
          <h2 className='font-heading text-base font-semibold'>{title}</h2>
          <p className='text-xs text-muted-foreground'>{hint}</p>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

/** Between two matrix rows: an arrow per column naming what the row above points at. */
function ArrowRow({
  cells,
}: {
  readonly cells: readonly { key: string; label: string; span: string }[];
}): ReactElement {
  return (
    <>
      <div />
      {cells.map((cell) => (
        <div
          key={cell.key}
          className={cn(
            'flex items-center justify-center gap-1 text-xs text-muted-foreground',
            cell.span,
          )}
        >
          <ArrowDown className='size-3.5' />
          {cell.label}
        </div>
      ))}
    </>
  );
}

/** The left-hand caption of a matrix row: what that row is. */
function RowLabel({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className='self-center pr-1 text-right text-xs leading-snug text-muted-foreground @3xl:pr-2'>
      {children}
    </div>
  );
}

function Arrow({
  label,
  centered,
  up,
}: {
  readonly label: string;
  readonly centered?: boolean;
  /** Points at the row above instead of the one below. */
  readonly up?: boolean;
}): ReactElement {
  return (
    <div
      className={cn(
        'flex items-center gap-1 text-xs text-muted-foreground',
        centered ? 'justify-center' : 'pl-1',
      )}
    >
      {up ? (
        <ArrowUp className='size-3.5' />
      ) : (
        <ArrowDown className='size-3.5' />
      )}
      {label}
    </div>
  );
}

/** One node: icon, name, live count, and a line on what it is. */
function NodeCard({
  node,
  note,
  compact,
}: {
  readonly node: Node;
  readonly note?: string;
  readonly compact?: boolean;
}): ReactElement {
  const list = useItamList<ItamRecord>(
    node.path ?? '',
    { pageSize: 1, filter: node.filter },
    { enabled: Boolean(node.path) },
  );
  const Icon = node.icon;
  return (
    <Link
      to={node.to}
      className={cn(
        // Its own container: a narrow card drops the icon before the name
        // would be cut short, and puts the count under the name if need be.
        // As tall as the row: a card whose count wrapped under its name
        // does not leave its neighbours shorter.
        '@container/node flex h-full flex-col justify-center rounded-lg border p-3 transition-colors hover:bg-accent',
        node.kind === 'master'
          ? 'border-border bg-card'
          : 'border-dashed border-border bg-muted/30',
        compact && 'px-1.5 py-2 @3xl:p-2',
      )}
    >
      <div className='flex flex-wrap items-center justify-center gap-x-2 gap-y-1'>
        <Icon className='hidden size-4 shrink-0 text-muted-foreground @[8.5rem]/node:block' />
        <span className='text-sm font-medium whitespace-nowrap'>
          {node.label}
        </span>
        {node.path ? (
          <Badge variant='secondary' className='tabular-nums'>
            {list.data ? list.data.total.toLocaleString() : '…'}
          </Badge>
        ) : null}
      </div>
      {note ? (
        <p className='mt-1.5 text-center text-xs leading-relaxed text-muted-foreground'>
          {note}
        </p>
      ) : null}
    </Link>
  );
}
