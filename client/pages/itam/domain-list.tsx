import { useTranslation } from '@nocobase/i18n/client';
import {
  ChevronsDownUp,
  ChevronsUpDown,
  Columns3,
  List,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useMemo, useState, type ReactElement } from 'react';
import { useNavigate, useOutlet, useSearchParams } from 'react-router';

import { FieldValue } from '@/components/itam/cells';
import { DataTable, type DataTableColumn } from '@/components/itam/data-table';
import { DeleteDialog } from '@/components/itam/delete-dialog';
import { EmptyState } from '@/components/itam/empty-state';
import { FoundRecords } from '@/components/itam/found-records';
import { ImportExport } from '@/components/itam/import-export';
import { Page, PageHeader } from '@/components/itam/page-header';
import { RecordFormDialog } from '@/components/itam/record-form-dialog';
import { RecordThumbnail } from '@/components/itam/record-image';
import { MasterDataFilters } from '@/components/itam/master-data-filters';
import { SearchBar, SearchToggle } from '@/components/itam/search-bar';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  apiErrorBody,
  useApi,
  useDeleteImpact,
  useItamList,
  useItamMutations,
  useItamSettings,
  type ItamRecord,
} from '@/lib/itam/api';
import type { DomainConfig } from '@/lib/itam/domain';
import type { FieldDefinition } from '@/lib/itam/fields';
import { errorMessage, text } from '@/lib/itam/format';
import { masterDataByName } from '@/lib/itam/master-data';
import {
  useCollectionPermissions,
  useCurrentUserId,
} from '@/lib/itam/permissions';
import { useReferenceNames } from '@/lib/itam/references';
import { FOUND_IDS, FOUND_TITLE, foundIds } from '@/lib/itam/search';

/** Generic list page for a business collection described by a DomainConfig. */
export function DomainListPage({
  domain,
}: {
  readonly domain: DomainConfig;
}): ReactElement {
  const outlet = useOutlet();
  return outlet ?? <DomainList domain={domain} />;
}

function DomainList({
  domain,
}: {
  readonly domain: DomainConfig;
}): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') ?? 1);
  const pageSize = Number(params.get('pageSize') ?? 20);
  const q = params.get('q') ?? '';
  const sortField =
    params.get('sort') ?? domain.defaultSort ?? domain.nameField;
  const sortOrder = params.get('order') === 'desc' ? 'desc' : 'asc';
  const settings = useItamSettings();
  const permissions = useCollectionPermissions(domain.name, [
    'create',
    'update',
    'delete',
  ]);

  const setParam = (updates: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined || value === '') next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: true });
  };
  const RESERVED = new Set([
    'page',
    'pageSize',
    'q',
    'sort',
    'order',
    'layout',
    'new',
    FOUND_IDS,
    FOUND_TITLE,
  ]);
  // Another page can open the create form with values filled in:
  // `?new=1&init.deviceId=…`; a list of ids arrives comma-separated.
  // The responsible user is asked for on creation and starts as the
  // creator; a prefill may still override it. Only for a collection that
  // has one: a prefill outside the form is sent with the create, and a
  // purchase order (which lost its owner on 2026-09-25) is refused over the
  // unknown key.
  const currentUserId = useCurrentUserId();
  const hasOwner =
    domain.ownerFromCreator !== false &&
    domain.fields.some((field) => field.key === 'ownerId');
  const initial: Record<string, unknown> =
    currentUserId && hasOwner ? { ownerId: currentUserId } : {};
  for (const [key, value] of params.entries()) {
    if (!key.startsWith('init.')) continue;
    const name = key.slice('init.'.length);
    initial[name] = name.endsWith('Ids')
      ? value.split(',').filter(Boolean)
      : value;
  }
  const clearPrefill = () => {
    const next = new URLSearchParams(params);
    next.delete('new');
    for (const key of [...next.keys()])
      if (key.startsWith('init.')) next.delete(key);
    setParams(next, { replace: true });
  };
  const filter: Record<string, string | undefined> = { ...domain.listFilter };
  for (const [key, value] of params.entries()) {
    if (!RESERVED.has(key) && !key.startsWith('init.')) filter[key] = value;
  }
  // A domain with a board opens on it (?layout=table for the list). A named
  // view (待我审批, 到货逾期) decides the statuses itself, so it reads as a
  // list: every column would otherwise show the same records.
  // The records Noco found for a question on the workbench read as a
  // table, whatever the page's own layout: a board or a tree of three
  // records would scatter them across columns and branches.
  const found = foundIds(params);
  const boardable = Boolean(domain.Board) && !filter.view && !found;
  // A tree is its own view: it carries search, filters and counts itself,
  // and the list request only answers the total in the header.
  const layout =
    domain.Tree && !found
      ? 'tree'
      : boardable && params.get('layout') !== 'table'
        ? 'board'
        : 'table';
  const [treeExpanded, setTreeExpanded] = useState(true);

  const list = useItamList<ItamRecord>(
    domain.path,
    {
      page,
      pageSize,
      q,
      sort: sortField,
      order: sortOrder,
      filter,
      ids: found,
    },
    { enabled: layout !== 'board' },
  );
  const mutations = useItamMutations<ItamRecord>(domain.path);
  const api = useApi();
  // A prefixed name carries its reference, which has no column of its own.
  const prefixField = domain.fields.find(
    (field) => field.key === domain.titlePrefixField,
  );
  const columns = domain.fields.filter(
    (field) => field.column && field.key !== prefixField?.key,
  );
  const rows = useMemo(() => list.data?.data ?? [], [list.data]);
  const referenceRequests = useMemo(
    () =>
      [...columns, ...(prefixField ? [prefixField] : [])]
        .filter((field) => field.type === 'reference' && field.reference)
        .map((field) => ({
          collection: field.reference!.collection,
          ids: rows.map((row) => row[field.key] as string | null),
        })),
    [columns, prefixField, rows],
  );
  const names = useReferenceNames(referenceRequests);
  const prefixFor = (row: ItamRecord): string => {
    const value = prefixField ? row[prefixField.key] : undefined;
    if (!prefixField?.reference || value === null || value === undefined)
      return '';
    return names[prefixField.reference.collection]?.get(text(value)) ?? '';
  };

  const filterFields = (domain.filterFields ?? []).map(
    (entry): FieldDefinition =>
      typeof entry === 'string'
        ? domain.fields.find((field) => field.key === entry)!
        : entry,
  );
  const filterActive = filterFields.some((field) => filter[field.key]);
  const [searchOpen, setSearchOpen] = useState(Boolean(q) || filterActive);
  const [creating, setCreating] = useState(params.get('new') === '1');
  const [editing, setEditing] = useState<ItamRecord>();
  const [deleting, setDeleting] = useState<ItamRecord>();
  const impact = useDeleteImpact(domain.path, deleting?.id);
  const objectLabel = t(`${domain.i18n}.object`);
  const currency = settings.data?.general.currency;

  const tableColumns: DataTableColumn<ItamRecord>[] = columns.map((field) => ({
    key:
      field.key === domain.nameField && domain.nameSort
        ? domain.nameSort
        : field.key,
    header:
      field.key === domain.nameField && prefixField
        ? `${t(prefixField.label)} / ${t(field.label)}`
        : t(field.label),
    sortable: field.type !== 'multiselect' && field.type !== 'reference',
    render: (row) =>
      field.key === domain.nameField ? (
        <span className='font-medium'>
          {domain.image ? (
            <RecordThumbnail
              fileId={text(row.imageFileId) || null}
              alt={text(row[domain.nameField])}
              credit={text(row.imageCredit) || null}
            />
          ) : null}
          {prefixFor(row) ? (
            <span className='font-normal text-muted-foreground'>
              {prefixFor(row)} /{' '}
            </span>
          ) : null}
          {text(row[field.key])}
        </span>
      ) : (
        <FieldValue
          field={field}
          value={row[field.key]}
          names={names}
          currency={text(row.currency) || currency}
          plainEnums={domain.plainCells}
          // An asset list shows the record's own category and place; the
          // detail page has the full path, as on the device list. Plain
          // cells read like the detail page, path and all.
          treeShow={
            !domain.plainCells &&
            (field.key === 'categoryId' || field.key === 'locationId')
              ? 'leaf'
              : 'path'
          }
        />
      ),
  }));
  // Columns that are not fields, each placed beside the column it names.
  for (const column of domain.listColumns ?? []) {
    const Cell = column.Cell;
    const entry: DataTableColumn<ItamRecord> = {
      key: column.key,
      header: t(column.label),
      width: column.width,
      className: column.className,
      render: (row) => <Cell row={row} />,
    };
    const anchor = tableColumns.findIndex(
      (existing) => existing.key === (column.after ?? column.before),
    );
    tableColumns.splice(
      anchor === -1 ? tableColumns.length : column.after ? anchor + 1 : anchor,
      0,
      entry,
    );
  }
  const rowActions =
    permissions.update || permissions.delete
      ? (row: ItamRecord) => (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant='ghost'
                  size='icon-sm'
                  aria-label={t('common.actions')}
                />
              }
            >
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              {permissions.update ? (
                <DropdownMenuItem onClick={() => setEditing(row)}>
                  <Pencil />
                  {t('actions.edit')}
                </DropdownMenuItem>
              ) : null}
              {permissions.delete &&
              (domain.deletable?.(row, currentUserId) ?? true) ? (
                <DropdownMenuItem
                  variant='destructive'
                  onClick={() => setDeleting(row)}
                >
                  <Trash2 />
                  {t('actions.deleteObject', { object: objectLabel })}
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      : undefined;

  // An explicit createFields list may include fields that are read-only
  // afterwards (e.g. an initial quantity), so the create form shows them.
  const createFields = (
    domain.createFields ??
    domain.fields
      .filter((field) => field.form !== false)
      .map((field) => field.key)
  ).map((key) => ({
    ...domain.fields.find((field) => field.key === key)!,
    form: true,
  }));
  const Stats = domain.Stats;
  const Views = domain.Views;

  return (
    <Page fill={layout === 'board'}>
      <PageHeader
        title={t(`${domain.i18n}.title`)}
        total={list.data?.total}
        actions={
          <>
            <SearchToggle
              active={searchOpen}
              onClick={() => setSearchOpen((current) => !current)}
            />
            <ImportExport
              collection={domain.name}
              exportQuery={{
                q,
                sort: sortField,
                order: sortOrder,
                // Exporting the records Noco found exports those records.
                ids: found?.join(','),
                ...Object.fromEntries(
                  Object.entries(filter).map(([key, value]) => [
                    `filter[${key}]`,
                    value,
                  ]),
                ),
              }}
              columns={
                domain.exportColumns === 'readable'
                  ? undefined
                  : columns.map((field) => field.key)
              }
            />
            {layout === 'tree' ? (
              <Button
                variant='outline'
                onClick={() => setTreeExpanded((current) => !current)}
              >
                {treeExpanded ? (
                  <ChevronsDownUp data-icon='inline-start' />
                ) : (
                  <ChevronsUpDown data-icon='inline-start' />
                )}
                {treeExpanded ? t('tree.collapseAll') : t('tree.expandAll')}
              </Button>
            ) : null}
            {boardable ? (
              <ButtonGroup aria-label={t('common.layout')}>
                <Button
                  variant={layout === 'board' ? 'secondary' : 'outline'}
                  size='icon'
                  aria-label={t('common.boardLayout')}
                  aria-pressed={layout === 'board'}
                  onClick={() => setParam({ layout: undefined })}
                >
                  <Columns3 />
                </Button>
                <Button
                  variant={layout === 'table' ? 'secondary' : 'outline'}
                  size='icon'
                  aria-label={t('common.tableLayout')}
                  aria-pressed={layout === 'table'}
                  onClick={() => setParam({ layout: 'table' })}
                >
                  <List />
                </Button>
              </ButtonGroup>
            ) : null}
            {permissions.create ? (
              <Button onClick={() => setCreating(true)}>
                <Plus data-icon='inline-start' />
                {t(`${domain.i18n}.new`)}
              </Button>
            ) : null}
          </>
        }
      />
      {/* The search box takes a row of its own under the header, so it
          opens below the title rather than beside it. */}
      <SearchBar
        value={q}
        open={searchOpen}
        onOpenChange={setSearchOpen}
        forceOpen={filterActive}
        onChange={(value) => setParam({ q: value, page: undefined })}
        onClear={() =>
          setParam({
            q: undefined,
            page: undefined,
            ...Object.fromEntries(
              filterFields.map((field) => [field.key, undefined]),
            ),
          })
        }
        filters={
          filterFields.length > 0 ? (
            <MasterDataFilters
              fields={filterFields}
              value={filter}
              onChange={(key, next) =>
                setParam({ [key]: next, page: undefined })
              }
            />
          ) : undefined
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
      {Views ? (
        <Views
          filter={filter}
          onFilter={(next) => setParam({ ...next, page: undefined })}
        />
      ) : null}
      {Stats ? (
        <Stats
          filter={filter}
          onFilter={(next) => setParam({ ...next, page: undefined })}
        />
      ) : null}
      {layout === 'tree' && domain.Tree ? (
        <domain.Tree
          expandAll={treeExpanded}
          search={q}
          filter={filter}
          rowActions={rowActions}
        />
      ) : layout === 'board' && domain.Board ? (
        <domain.Board filter={filter} q={q} />
      ) : (
        <DataTable
          columns={tableColumns}
          rows={list.data?.data}
          loading={list.isFetching}
          error={list.error}
          sort={{ field: sortField, order: sortOrder }}
          onSortChange={(field) =>
            setParam({
              sort: field,
              order:
                sortField === field && sortOrder === 'asc' ? 'desc' : 'asc',
            })
          }
          onRowClick={(row) => void navigate(`/${domain.route}/${row.id}`)}
          empty={
            <EmptyState
              title={t(`${domain.i18n}.empty`)}
              action={
                permissions.create ? (
                  <Button variant='outline' onClick={() => setCreating(true)}>
                    <Plus data-icon='inline-start' />
                    {t(`${domain.i18n}.new`)}
                  </Button>
                ) : undefined
              }
            />
          }
          pagination={{
            page,
            pageSize,
            total: list.data?.total ?? 0,
            onPageChange: (next) => setParam({ page: String(next) }),
            onPageSizeChange: (next) =>
              setParam({ pageSize: String(next), page: undefined }),
          }}
          rowActions={rowActions}
        />
      )}

      {domain.Create ? (
        <domain.Create
          open={creating}
          onOpenChange={setCreating}
          onCreated={(created) => {
            setCreating(false);
            void navigate(`/${domain.route}/${created.id}`);
          }}
        />
      ) : (
        <RecordFormDialog
          key={creating ? 'create' : 'create-closed'}
          open={creating}
          onOpenChange={(open) => {
            setCreating(open);
            if (!open) {
              mutations.create.reset();
              clearPrefill();
            }
          }}
          title={t(`${domain.i18n}.new`)}
          fields={createFields}
          initial={initial}
          derive={domain.derive}
          attachments={domain.createAttachments}
          submitting={mutations.create.isPending}
          error={mutations.create.error}
          onSubmit={async (values, files) => {
            // Prefilled values outside the form (e.g. deviceIds) go along.
            const created = await mutations.create.mutateAsync({
              ...domain.createDefaults,
              ...Object.fromEntries(
                Object.entries(initial).filter(
                  ([key]) => !createFields.some((field) => field.key === key),
                ),
              ),
              ...values,
            });
            if (files.length > 0)
              await api.request({
                path: `itam/attachments/${domain.name}/${String(created.id)}`,
                method: 'POST',
                json: { fileIds: files.map((file) => file.id) },
              });
            setCreating(false);
            await navigate(`/${domain.route}/${created.id}`);
          }}
        />
      )}
      <RecordFormDialog
        key={editing?.id ?? 'edit-closed'}
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(undefined);
            mutations.update.reset();
          }
        }}
        title={t(`${domain.i18n}.edit`)}
        fields={domain.fields.filter((field) => field.form !== false)}
        initial={editing}
        recordId={editing?.id}
        submitting={mutations.update.isPending}
        error={mutations.update.error}
        onSubmit={async (values) => {
          if (!editing) return;
          if (Object.keys(values).length > 0)
            await mutations.update.mutateAsync({
              id: editing.id,
              input: values,
            });
          setEditing(undefined);
        }}
      />
      <DeleteDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(undefined);
            mutations.remove.reset();
          }
        }}
        objectLabel={objectLabel}
        recordName={text(deleting?.[domain.nameField])}
        impact={impact.data}
        loadingImpact={impact.isLoading}
        deleting={mutations.remove.isPending}
        error={
          mutations.remove.error
            ? (apiErrorBody(mutations.remove.error)?.message ??
              errorMessage(mutations.remove.error))
            : undefined
        }
        collectionLabel={(name) =>
          t(`references.${name}`, {
            defaultValue: t(`${masterDataByName(name)?.i18n ?? name}.title`, {
              defaultValue: name,
            }),
          })
        }
        onConfirm={() => {
          if (!deleting) return;
          void mutations.remove
            .mutateAsync(deleting.id)
            .then(() => setDeleting(undefined));
        }}
      />
    </Page>
  );
}
