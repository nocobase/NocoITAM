import { useTranslation } from '@nocobase/i18n/client';
import { Plus } from 'lucide-react';
import { useMemo, useRef, useState, type ReactElement } from 'react';
import { useNavigate, useOutlet, useSearchParams } from 'react-router';

import { FieldValue } from '@/components/itam/cells';
import { MasterDataFilters } from '@/components/itam/master-data-filters';
import { DeviceRelation } from '@/components/itam/device-relation';
import { TreePath } from '@/components/itam/tree-path';
import { DataTable, type DataTableColumn } from '@/components/itam/data-table';
import { EmptyState } from '@/components/itam/empty-state';
import { Page, PageHeader } from '@/components/itam/page-header';
import { RecordFormDialog } from '@/components/itam/record-form-dialog';
import { FoundRecords } from '@/components/itam/found-records';
import { ImportExport } from '@/components/itam/import-export';
import { SearchBar, SearchToggle } from '@/components/itam/search-bar';
import { DeviceStatusBadge } from '@/components/itam/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useItamList, useItamMutations, type ItamRecord } from '@/lib/itam/api';
import { DEVICES_PATH } from '@/lib/itam/device-api';
import {
  DEVICE_CREATE_FIELDS,
  DEVICE_FIELDS,
  holderCollection,
} from '@/lib/itam/devices';
import { addMonths, text } from '@/lib/itam/format';
import type { FieldDefinition } from '@/lib/itam/fields';
import { useCurrentUserId } from '@/lib/itam/permissions';
import { useReferenceNames } from '@/lib/itam/references';
import { isTreeReference } from '@/lib/itam/tree';
import { FOUND_IDS, FOUND_TITLE, foundIds } from '@/lib/itam/search';

/** Stat-card names for the views the workbench links to. */
const VIEW_LABELS: Readonly<Record<string, string>> = {
  available: 'available',
  warrantyExpiring: 'warrantyExpiring',
  auditOverdue: 'auditOverdue',
  inRepair: 'inRepair',
  createdThisMonth: 'createdThisMonth',
};

export default function DevicesListPage(): ReactElement {
  const outlet = useOutlet();
  return outlet ?? <DevicesList />;
}

function DevicesList(): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') ?? 1);
  const pageSize = Number(params.get('pageSize') ?? 20);
  const q = params.get('q') ?? '';
  const sortField = params.get('sort') ?? 'deviceNo';
  const sortOrder = params.get('order') === 'desc' ? 'desc' : 'asc';
  const view = params.get('view') ?? undefined;
  const status = params.get('status') ?? undefined;
  const categoryId = params.get('categoryId') ?? undefined;
  const locationId = params.get('locationId') ?? undefined;
  const departmentId = params.get('departmentId') ?? undefined;
  // The devices Noco found for a question asked on the workbench.
  const found = foundIds(params);

  const setParam = (updates: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined || value === '') next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: true });
  };

  const list = useItamList<ItamRecord>(DEVICES_PATH, {
    page,
    pageSize,
    q,
    sort: sortField,
    order: sortOrder,
    filter: { view, status, categoryId, locationId, departmentId },
    ids: found,
  });
  const mutations = useItamMutations<ItamRecord>(DEVICES_PATH);
  const currentUserId = useCurrentUserId();

  const columns = DEVICE_FIELDS.filter((field) => field.column);
  // Status, category (device categories only), location and department
  // filter the list.
  const filterFields = useMemo(
    () =>
      // In the columns' order: 分类、状态、所属部门、存放位置.
      ['categoryId', 'status', 'departmentId', 'locationId'].map((key) => {
        const field = DEVICE_FIELDS.find((entry) => entry.key === key)!;
        return key === 'categoryId'
          ? {
              ...field,
              reference: {
                ...field.reference!,
                filter: { appliesTo: 'device' },
              },
            }
          : field;
      }),
    [],
  );
  const rows = useMemo(() => list.data?.data ?? [], [list.data]);
  const referenceRequests = useMemo(
    () => [
      ...columns
        .filter((field) => field.type === 'reference' && field.reference)
        .map((field) => ({
          collection: field.reference!.collection,
          ids: rows.map((row) => row[field.key] as string | null),
        })),
      // Holders and reservations, whichever the row carries.
      ...(['person', 'location', 'device'] as const).map((type) => ({
        collection: holderCollection(type),
        ids: rows.map((row) =>
          row.assigneeType === type
            ? (row.assigneeId as string)
            : row.reservedForType === type
              ? (row.reservedForId as string)
              : null,
        ),
      })),
    ],
    [columns, rows],
  );
  const names = useReferenceNames(referenceRequests);

  const [creating, setCreating] = useState(false);
  const derivedNameRef = useRef('');
  // The model chosen in the create dialog and the warranty end it implied,
  // so a changed purchase date recomputes a date the user never touched.
  const derivedModelRef = useRef<ItamRecord | undefined>(undefined);
  const derivedWarrantyRef = useRef('');
  const [searchOpen, setSearchOpen] = useState(
    Boolean(q || status || categoryId || locationId || departmentId),
  );

  // 所属部门、存放位置 and 更新时间 close the table, after the holder column.
  const trailing = ['departmentId', 'locationId', 'updatedAt'];
  const fieldColumn = (
    field: FieldDefinition,
  ): DataTableColumn<ItamRecord> => ({
    key: field.key,
    header: t(field.label),
    sortable: field.type !== 'reference',
    render: (row: ItamRecord) =>
      field.key === 'deviceNo' ? (
        <span className='font-medium'>{text(row.deviceNo)}</span>
      ) : field.key === 'status' ? (
        <DeviceStatusBadge status={row.status} />
      ) : isTreeReference(field) && row[field.key] ? (
        // The list keeps tree columns short: the device's own category,
        // the top-level department and site. The full path is on the detail page.
        <TreePath
          collection={field.reference!.collection}
          nodeId={row[field.key]}
          show={field.key === 'categoryId' ? 'leaf' : 'root'}
        />
      ) : (
        <FieldValue field={field} value={row[field.key]} names={names} />
      ),
  });
  const tableColumns: DataTableColumn<ItamRecord>[] = [
    ...columns
      .filter((field) => !trailing.includes(field.key))
      .map(fieldColumn),
    {
      key: 'assignee',
      header: t('devices.holding'),
      className: 'whitespace-nowrap',
      // The holder with its kind's icon; the status column already says
      // whether it is an assignment or a loan. A reservation is not a
      // holder, so a reserved device reads as empty here.
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
    ...columns.filter((field) => trailing.includes(field.key)).map(fieldColumn),
  ];

  return (
    <Page>
      <PageHeader
        title={t('devices.title')}
        total={list.data?.total}
        actions={
          <>
            <SearchToggle
              active={searchOpen}
              onClick={() => setSearchOpen((current) => !current)}
            />
            <ImportExport
              collection='devices'
              exportQuery={{
                q,
                // Exporting the devices Noco found exports those devices.
                ids: found?.join(','),
                ...Object.fromEntries(
                  [...params.entries()]
                    .filter(
                      ([key]) =>
                        ![
                          'page',
                          'pageSize',
                          'q',
                          FOUND_IDS,
                          FOUND_TITLE,
                        ].includes(key),
                    )
                    .map(([key, value]) => [
                      ['sort', 'order'].includes(key) ? key : `filter[${key}]`,
                      value,
                    ]),
                ),
              }}
              columns={columns.map((field) => field.key)}
            />
            <Button onClick={() => setCreating(true)}>
              <Plus data-icon='inline-start' />
              {t('devices.new')}
            </Button>
          </>
        }
      />
      {/* The search box and filters take a row of their own under the
          header, so they open below the title rather than beside it. */}
      <SearchBar
        value={q}
        open={searchOpen}
        onOpenChange={setSearchOpen}
        forceOpen={Boolean(status || categoryId || locationId || departmentId)}
        onChange={(value) => setParam({ q: value, page: undefined })}
        onClear={() =>
          setParam({
            q: undefined,
            status: undefined,
            categoryId: undefined,
            locationId: undefined,
            departmentId: undefined,
            page: undefined,
          })
        }
        filters={
          // The same controls as the master-data lists, so every list's
          // filters look alike.
          <MasterDataFilters
            fields={filterFields}
            value={{ status, categoryId, locationId, departmentId }}
            onChange={(key, next) => setParam({ [key]: next, page: undefined })}
          />
        }
      />
      {found ? (
        <FoundRecords
          title={params.get(FOUND_TITLE)}
          count={found.length}
          onClear={() =>
            setParam({
              [FOUND_IDS]: undefined,
              [FOUND_TITLE]: undefined,
              page: undefined,
            })
          }
        />
      ) : null}
      {view ? (
        // A workbench link lands here with a view; show it so it can be cleared.
        <div className='flex items-center gap-2 text-sm'>
          <Badge variant='secondary'>
            {t(`devices.stats.${VIEW_LABELS[view] ?? view}`, {
              defaultValue: view,
            })}
          </Badge>
          <button
            type='button'
            className='text-muted-foreground underline-offset-4 hover:underline'
            onClick={() => setParam({ view: undefined, page: undefined })}
          >
            {t('common.clear')}
          </button>
        </div>
      ) : null}
      <DataTable
        columns={tableColumns}
        rows={list.data?.data}
        loading={list.isFetching}
        error={list.error}
        sort={{ field: sortField, order: sortOrder }}
        onSortChange={(field) =>
          setParam({
            sort: field,
            order: sortField === field && sortOrder === 'asc' ? 'desc' : 'asc',
          })
        }
        onRowClick={(row) => void navigate(`/devices/${row.id}`)}
        empty={<EmptyState title={t('devices.empty')} />}
        pagination={{
          page,
          pageSize,
          total: list.data?.total ?? 0,
          onPageChange: (next) => setParam({ page: String(next) }),
          onPageSizeChange: (next) =>
            setParam({ pageSize: String(next), page: undefined }),
        }}
      />

      <RecordFormDialog
        key={creating ? 'create' : 'closed'}
        open={creating}
        onOpenChange={(open) => {
          setCreating(open);
          if (!open) mutations.create.reset();
        }}
        title={t('devices.new')}
        fields={DEVICE_CREATE_FIELDS.map((key) =>
          DEVICE_FIELDS.find((field) => field.key === key)!,
        )}
        initial={currentUserId ? { ownerId: currentUserId } : undefined}
        derive={(change, values) => {
          if (change.key !== 'modelId' && change.key !== 'purchaseDate')
            return undefined;
          const next: Record<string, unknown> = {};
          if (change.key === 'modelId') {
            derivedModelRef.current = change.record;
            // Category and manufacturer follow the model, read-only.
            next.categoryId = change.record?.categoryId ?? null;
            next.manufacturerId = change.record?.manufacturerId ?? null;
            // The name defaults to the model name and follows the model
            // until the user types a name of their own.
            const current = text(values.name);
            if (!current || current === derivedNameRef.current) {
              derivedNameRef.current = change.record
                ? text(change.record.name)
                : '';
              next.name = derivedNameRef.current || null;
            }
          }
          // Warranty end = purchase date + the model's warranty months,
          // shown as soon as both are known; a date typed by hand stays
          // (the server also fills the category default when the model
          // has none).
          const purchaseDate = text(
            change.key === 'purchaseDate' ? change.value : values.purchaseDate,
          );
          const months = Number(derivedModelRef.current?.warrantyMonths ?? 0);
          const warranty = text(values.warrantyEndDate);
          if (!warranty || warranty === derivedWarrantyRef.current) {
            derivedWarrantyRef.current =
              purchaseDate && months > 0 ? addMonths(purchaseDate, months) : '';
            next.warrantyEndDate = derivedWarrantyRef.current || null;
          }
          return next;
        }}
        submitting={mutations.create.isPending}
        error={mutations.create.error}
        onSubmit={async (values) => {
          const created = await mutations.create.mutateAsync(values);
          setCreating(false);
          await navigate(`/devices/${created.id}`);
        }}
      />
    </Page>
  );
}
