import { useTranslation } from '@nocobase/i18n/client';
import { useMemo, useState, type ReactElement } from 'react';

import type { DataTableColumn } from './data-table.js';

import { useItamList, type ItamRecord } from '@/lib/itam/api';
import { DEVICES_PATH } from '@/lib/itam/device-api';
import { holderCollection } from '@/lib/itam/devices';
import { deviceLabel, formatDate, text } from '@/lib/itam/format';
import { useOpenRecord } from '@/lib/itam/record-drawer';
import { useReferenceNames } from '@/lib/itam/references';

import { FieldValue } from './cells.js';
import { DataTable } from './data-table.js';
import { DeviceRelation } from './device-relation.js';
import { EmptyState } from './empty-state.js';
import { DeviceStatusBadge } from './status-badge.js';
import { TreePath } from './tree-path.js';

/** A compact device list embedded in a related-record tab. */
export function DeviceListEmbed({
  filter,
  // Inside a record's tab the list is a plain "none yet", not a filter miss.
  emptyKey = 'devices.noneInTab',
  leading = [],
  omit = [],
  show = [],
}: {
  readonly filter: Readonly<Record<string, string | undefined>>;
  readonly emptyKey?: string;
  /** Columns before the device's own, e.g. a model's 资产 tab's type. */
  readonly leading?: readonly DataTableColumn<ItamRecord>[];
  /** Columns every row shares here, e.g. the model on a model's own tab. */
  readonly omit?: readonly string[];
  /** Columns most tabs leave out: the serial number and who holds it. */
  readonly show?: readonly ('serialNo' | 'assignee')[];
}): ReactElement {
  const { t } = useTranslation();
  const openRecord = useOpenRecord();
  const [page, setPage] = useState(1);
  const list = useItamList<ItamRecord>(DEVICES_PATH, {
    page,
    pageSize: 20,
    sort: 'deviceNo',
    filter,
  });
  const rows = useMemo(() => list.data?.data ?? [], [list.data]);
  const names = useReferenceNames(
    useMemo(
      () => [
        { collection: 'models', ids: rows.map((row) => row.modelId as string) },
        // The holders, for the 去向 column; a device holds a component.
        ...['people', 'locations', 'devices'].map((collection) => ({
          collection,
          ids: rows
            .filter(
              (row) =>
                row.assigneeId &&
                holderCollection(row.assigneeType) === collection,
            )
            .map((row) => text(row.assigneeId)),
        })),
      ],
      [rows],
    ),
  );
  return (
    <DataTable
      columns={(
        [
          ...leading,
          {
            // 编号 / 名称 in one cell, the way a device is named everywhere.
            key: 'device',
            header: t('devices.noAndName'),
            render: (row) => (
              <span className='font-medium'>{deviceLabel(row)}</span>
            ),
          },
          ...(show.includes('serialNo')
            ? [
                {
                  key: 'serialNo',
                  header: t('fields.serialNo'),
                  className: 'w-px whitespace-nowrap',
                  render: (row: ItamRecord) => text(row.serialNo) || '—',
                },
              ]
            : []),
          {
            key: 'modelId',
            header: t('fields.model'),
            className: 'w-px whitespace-nowrap',
            render: (row) => (
              <FieldValue
                field={{
                  key: 'modelId',
                  label: 'fields.model',
                  type: 'reference',
                  reference: { collection: 'models' },
                }}
                value={row.modelId}
                names={names}
              />
            ),
          },
          {
            key: 'categoryId',
            header: t('fields.category'),
            className: 'w-px whitespace-nowrap',
            // The device's own category, not its path; the detail page has
            // the full path.
            render: (row) =>
              row.categoryId ? (
                <TreePath
                  collection='categories'
                  nodeId={row.categoryId}
                  show='leaf'
                />
              ) : (
                '—'
              ),
          },
          {
            key: 'status',
            header: t('fields.status'),
            className: 'w-px whitespace-nowrap',
            render: (row) => <DeviceStatusBadge status={row.status} />,
          },
          ...(show.includes('assignee')
            ? [
                {
                  key: 'assignee',
                  header: t('devices.holding'),
                  className: 'whitespace-nowrap',
                  // As the device list shows it: the holder with its kind's
                  // icon, its top-level site for a place, no date.
                  render: (row: ItamRecord) =>
                    row.assigneeId ? (
                      <DeviceRelation
                        device={row}
                        names={names}
                        locationShow='root'
                        dates={false}
                      />
                    ) : (
                      <span className='text-muted-foreground'>—</span>
                    ),
                },
              ]
            : []),
          {
            key: 'assignedAt',
            header: t('fields.assignedAt'),
            className: 'w-px whitespace-nowrap',
            render: (row) => formatDate(row.assignedAt),
          },
        ] satisfies DataTableColumn<ItamRecord>[]
      ).filter((column) => !omit.includes(column.key))}
      rows={list.data?.data}
      loading={list.isFetching}
      error={list.error}
      onRowClick={(row) => openRecord(`/devices/${row.id}`)}
      empty={<EmptyState title={t(emptyKey)} />}
      pagination={{
        page,
        pageSize: 20,
        total: list.data?.total ?? 0,
        onPageChange: setPage,
      }}
    />
  );
}
