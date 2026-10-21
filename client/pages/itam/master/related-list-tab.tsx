import { useTranslation } from '@nocobase/i18n/client';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, type ReactElement } from 'react';
import { useParams } from 'react-router';

import { FieldValue } from '@/components/itam/cells';
import { DataTable, type DataTableColumn } from '@/components/itam/data-table';
import { EmptyState } from '@/components/itam/empty-state';
import { useApi, useItamList, type ItamRecord } from '@/lib/itam/api';
import { DEVICES_PATH } from '@/lib/itam/device-api';
import { STOCK_PATH } from '@/lib/itam/stock';
import { text } from '@/lib/itam/format';
import { masterDataByName } from '@/lib/itam/master-data';
import { masterTarget, type RelatedTarget } from '@/lib/itam/related-targets';
import { useOpenRecord } from '@/lib/itam/record-drawer';
import { useReferenceNames } from '@/lib/itam/references';

/**
 * Lists the records that reference the current one — a category's models, a
 * tree node's children, a vendor's orders — with an optional count column.
 */
export function RelatedListTab({
  collection,
  target: explicitTarget,
  filterField,
  countKind = 'devices',
  countLabel = 'tabs.total',
  countColumns: explicitCountColumns,
  leading = [],
}: {
  /** A master-data collection to list, e.g. `models`; or pass `target`. */
  readonly collection?: string;
  readonly target?: RelatedTarget;
  /** Its field that points at the current record, e.g. `categoryId`. */
  readonly filterField: string;
  /**
   * What the trailing count column counts; `both` shows a 设备 and a 库存
   * column, `none` drops the column.
   */
  readonly countKind?: 'devices' | 'stock' | 'both' | 'none';
  /** Header of the single count column; defaults to 合计. */
  readonly countLabel?: string;
  /** Overrides the listed collection's own `countColumns`. */
  readonly countColumns?: readonly { key: string; label: string }[];
  /** Columns before the listed records' own, e.g. a model's 资产 tab's type. */
  readonly leading?: readonly DataTableColumn<ItamRecord>[];
}): ReactElement {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const openRecord = useOpenRecord();
  const api = useApi();
  const target = explicitTarget ?? masterTarget(collection!);
  const [page, setPage] = useState(1);
  const list = useItamList<ItamRecord>(target.path, {
    page,
    pageSize: 20,
    sort: target.defaultSort ?? target.nameField,
    order: target.defaultOrder,
    filter: { ...target.listFilter, [filterField]: id },
  });
  const rows = useMemo(() => list.data?.data ?? [], [list.data]);
  // Device counts are grouped by the listed collection's foreign key.
  const countField =
    countKind === 'none' || !collection
      ? undefined
      : {
          models: 'modelId',
          categories: 'categoryId',
          locations: 'locationId',
          departments: 'departmentId',
          manufacturers: 'manufacturerId',
        }[collection];
  const countPath = countKind === 'stock' ? STOCK_PATH : DEVICES_PATH;
  const counts = useQuery({
    queryKey: ['itam', countPath, 'counts', countField],
    enabled: Boolean(countField),
    queryFn: async () =>
      (
        await api.request<{ data: Record<string, number> }>({
          path: `${countPath}/counts`,
          query: { by: countField },
        })
      ).data,
  });
  // `both`: the stock quantity on hand next to the device count.
  const stockCounts = useQuery({
    queryKey: ['itam', STOCK_PATH, 'counts', countField],
    enabled: Boolean(countField) && countKind === 'both',
    queryFn: async () =>
      (
        await api.request<{ data: Record<string, number> }>({
          path: `${STOCK_PATH}/counts`,
          query: { by: countField },
        })
      ).data,
  });
  // Related-record count columns the listed collection declares for its own
  // list page (a software product's entitlements).
  const countColumns =
    explicitCountColumns ??
    (collection ? (masterDataByName(collection)?.countColumns ?? []) : []);
  const relatedCounts = useQuery({
    queryKey: ['itam', target.path, 'counts'],
    enabled: countColumns.length > 0,
    queryFn: async () =>
      (
        await api.request<{ data: Record<string, Record<string, number>> }>({
          path: `${target.path}/counts`,
        })
      ).data,
  });
  const names = useReferenceNames(
    useMemo(
      () =>
        target.fields
          .filter((field) => field.type === 'reference' && field.reference)
          .map((field) => ({
            collection: field.reference!.collection,
            ids: rows.map((row) => text(row[field.key])).filter(Boolean),
          })),
      [target, rows],
    ),
  );
  // Related lists keep the identifying columns; rule switches such as
  // "requires serial" belong on the record itself.
  const columns = target.fields.filter(
    (field) =>
      field.column &&
      field.type !== 'boolean' &&
      field.key !== filterField &&
      !['createdAt', 'updatedAt', 'createdById'].includes(field.key),
  );

  if (list.data && rows.length === 0) {
    return <EmptyState title={t(`${target.i18n}.empty`)} />;
  }
  return (
    <DataTable
      columns={[
        ...leading,
        ...columns.slice(0, 4).map((field) => ({
          key: field.key,
          header: t(field.label),
          render: (row: ItamRecord) =>
            field.key === target.nameField ? (
              <span className='font-medium'>{text(row[field.key])}</span>
            ) : (
              <FieldValue
                field={field}
                value={row[field.key]}
                names={names}
                plainEnums
              />
            ),
        })),
        ...(countField && countKind === 'both'
          ? [
              {
                key: 'count',
                header: t('tabs.devices'),
                className: 'tabular-nums',
                render: (row: ItamRecord) => counts.data?.[row.id] ?? 0,
              },
              {
                key: 'stock',
                header: t('tabs.stock'),
                className: 'tabular-nums',
                render: (row: ItamRecord) => stockCounts.data?.[row.id] ?? 0,
              },
            ]
          : countField
            ? [
                {
                  key: 'count',
                  header: t(countLabel),
                  className: 'tabular-nums',
                  render: (row: ItamRecord) => counts.data?.[row.id] ?? 0,
                },
              ]
            : []),
        ...countColumns.map((column) => ({
          key: `count:${column.key}`,
          header: t(column.label),
          className: 'tabular-nums',
          render: (row: ItamRecord) =>
            relatedCounts.data?.[column.key]?.[row.id] ?? 0,
        })),
      ]}
      rows={rows}
      loading={list.isLoading}
      onRowClick={(row) => openRecord(target.routeFor(row))}
      pagination={{
        page,
        pageSize: 20,
        total: list.data?.total ?? 0,
        onPageChange: setPage,
      }}
    />
  );
}
