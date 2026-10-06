import { useTranslation } from '@nocobase/i18n/client';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';

import { AssetTypeBadge } from '@/components/itam/asset-type-badge';
import { EmptyState } from '@/components/itam/empty-state';
import { FieldTemplateEditor } from '@/components/itam/field-template-editor';
import { MasterDataTree } from '@/components/itam/master-data-tree';
import { PeopleStatCards } from '@/components/itam/people-stats';
import { RecordPane } from '@/components/itam/record-drawer';
import { RecordFormDialog } from '@/components/itam/record-form-dialog';
import { Button } from '@/components/ui/button';
import {
  apiErrorBody,
  masterDataPath,
  useApi,
  useItamList,
  useItamMutations,
  useItamRecord,
  type ItamRecord,
} from '@/lib/itam/api';
import { DEVICES_PATH } from '@/lib/itam/device-api';
import { HideBreadcrumbContext } from '@/lib/itam/detail-chrome';
import type { DomainTreeProps } from '@/lib/itam/domain';
import { errorMessage, text } from '@/lib/itam/format';
import type { MasterDataCollection } from '@/lib/itam/master-data';
import { useCollectionPermissions } from '@/lib/itam/permissions';
import { STOCK_PATH } from '@/lib/itam/stock';

import { PersonActions } from '../people/person-actions.js';

import { statsRequest, type MasterDataStats } from './master-stats.js';

/**
 * The pieces only reference data has — the tree, the per-record counts, the
 * category a model follows, a person's departure — which `masterDomain()`
 * hands to the generic domain pages through their `DomainConfig` slots.
 */

function useMasterStats(name: string, id: string) {
  const api = useApi();
  const request = statsRequest(name, id);
  return useQuery({
    queryKey: request.queryKey,
    enabled: Boolean(id),
    queryFn: async () =>
      (await api.request<{ data: MasterDataStats }>({ path: request.path }))
        .data,
  });
}

// ---------------------------------------------------------------- list

export function MasterTree({
  collection,
  ...props
}: DomainTreeProps & {
  readonly collection: MasterDataCollection;
}): ReactElement {
  if (collection.tree) return <TreePanes collection={collection} {...props} />;
  return (
    <MasterDataTree
      collection={collection}
      expandAll={props.expandAll}
      search={props.search}
      filter={props.filter}
      rowActions={props.rowActions}
    />
  );
}

/**
 * A tree of reference data reads as two panes (categories, then locations
 * and departments, 2026-10-06): the tree in a narrow column — names only,
 * since the kind and the count are on the record — and the clicked node's
 * own detail page beside it, where it is read and edited without a drawer
 * over the tree. The node is named in the address (`?selected=`), so a
 * refresh or a link keeps it open; leaving it from inside (its 返回, or
 * deleting it) clears the pane.
 */
function TreePanes({
  collection,
  ...props
}: DomainTreeProps & {
  readonly collection: MasterDataCollection;
}): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const selected = params.get('selected') ?? undefined;
  // The same list the tree reads (shared query): once the open category
  // is gone — deleted from its row — the pane empties instead of showing a
  // record that no longer exists.
  const nodes = useItamList<ItamRecord>(masterDataPath(collection.name), {
    pageSize: 200,
    sort: 'sort',
  }).data?.data;
  const gone =
    selected !== undefined &&
    nodes !== undefined &&
    !nodes.some((node) => node.id === selected);
  const select = (id: string | undefined) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (id) next.set('selected', id);
        else next.delete('selected');
        return next;
      },
      { replace: true },
    );
  useEffect(() => {
    if (gone) select(undefined);
  });
  return (
    // As tall as the page leaves (`treeFills`): each pane scrolls on its
    // own, so a long tree never pushes the record out of view.
    <div className='grid min-h-80 flex-1 gap-4 @xl:grid-cols-[minmax(13rem,17rem)_minmax(0,1fr)] @xl:grid-rows-[minmax(0,1fr)]'>
      <div className='min-h-0 overflow-y-auto'>
        <MasterDataTree
          collection={collection}
          compact
          expandAll={props.expandAll}
          search={props.search}
          filter={props.filter}
          // Editing is the pane's; a row keeps only its delete.
          rowActions={
            props.onDelete
              ? (row) => (
                  <Button
                    variant='ghost'
                    size='icon-sm'
                    className='text-muted-foreground hover:text-destructive'
                    aria-label={t('actions.deleteObject', {
                      object: t(`${collection.i18n}.object`),
                    })}
                    title={t('actions.delete')}
                    onClick={() => props.onDelete?.(row)}
                  >
                    <Trash2 />
                  </Button>
                )
              : undefined
          }
          selectedId={selected}
          onSelect={select}
        />
      </div>
      {selected ? (
        <section className='min-h-0 min-w-0 overflow-y-auto rounded-lg border border-border bg-card'>
          {/* The tree beside says where it sits: no breadcrumb here. */}
          <HideBreadcrumbContext.Provider value>
            <RecordPane
              key={selected}
              to={`/${collection.route}/${selected}`}
              // Following a link to another category inside the pane (its
              // breadcrumb's parent) moves the tree's selection with it.
              toolbar={<FollowRecord selected={selected} onSelect={select} />}
              onLeave={(path) => {
                // Back to the list is this page: the pane empties. Anywhere
                // else, the page moves there.
                if (path.split('?')[0] === `/${collection.route}`)
                  select(undefined);
                else void navigate(path);
              }}
            />
          </HideBreadcrumbContext.Provider>
        </section>
      ) : (
        <EmptyState
          title={t('tree.pickToEdit', {
            object: t(`${collection.i18n}.object`),
          })}
        />
      )}
    </div>
  );
}

/** Inside the pane's router: reports the record the pane has moved to. */
function FollowRecord({
  selected,
  onSelect,
}: {
  readonly selected: string;
  readonly onSelect: (id: string) => void;
}): null {
  const id = useLocation().pathname.split('/')[2];
  useEffect(() => {
    if (id && id !== selected) onSelect(id);
  }, [id, selected, onSelect]);
  return null;
}

/** One column of `/itam/master/:collection/counts`. */
export function RelatedCountCell({
  collection,
  countKey,
  row,
}: {
  readonly collection: string;
  readonly countKey: string;
  readonly row: ItamRecord;
}): ReactElement {
  const api = useApi();
  const path = masterDataPath(collection);
  const counts = useQuery({
    queryKey: ['itam', path, 'counts'],
    queryFn: async () =>
      (
        await api.request<{ data: Record<string, Record<string, number>> }>({
          path: `${path}/counts`,
        })
      ).data,
  });
  const column = counts.data?.[countKey];
  return <>{column ? (column[row.id] ?? 0).toLocaleString() : ''}</>;
}

/** Every category, for the kind a record filed under one reads from it. */
function useCategoryKinds() {
  return useItamList<ItamRecord>(masterDataPath('categories'), {
    pageSize: 500,
  });
}

function appliesToOf(
  categories: readonly ItamRecord[] | undefined,
  row: ItamRecord,
): string | undefined {
  return (
    text(categories?.find((entry) => entry.id === row.categoryId)?.appliesTo) ||
    undefined
  );
}

/** The category's device type, beside the category itself. */
export function CategoryKindCell({
  row,
}: {
  readonly row: ItamRecord;
}): ReactElement {
  const categories = useCategoryKinds();
  return <AssetTypeBadge value={appliesToOf(categories.data?.data, row)} />;
}

function useCountsBy(path: string, by: string) {
  const api = useApi();
  return useQuery({
    queryKey: ['itam', path, 'counts', by],
    queryFn: async () =>
      (
        await api.request<{ data: Record<string, number> }>({
          path: `${path}/counts`,
          query: { by },
        })
      ).data,
  });
}

/**
 * 数量: what the record has on hand — devices or stock units, whichever its
 * category holds (a model has one or the other).
 */
export function OnHandCell({
  countField,
  row,
}: {
  readonly countField: string;
  readonly row: ItamRecord;
}): ReactElement {
  const { t } = useTranslation();
  const devices = useCountsBy(DEVICES_PATH, countField);
  const stock = useCountsBy(STOCK_PATH, countField);
  const categories = useCategoryKinds();
  if (!devices.data || !stock.data) return <></>;
  const applies = appliesToOf(categories.data?.data, row);
  const kind = applies === 'device' || !applies ? 'device' : 'stock';
  const total =
    kind === 'device' ? (devices.data[row.id] ?? 0) : (stock.data[row.id] ?? 0);
  return (
    <>{`${t(kind === 'device' ? 'tabs.devices' : 'tabs.stock')} ${total.toLocaleString()}`}</>
  );
}

/** The cards above the people list; the list's own URL says which is active. */
export function PeopleStats({
  onFilter,
}: {
  readonly onFilter: (
    filter: Readonly<Record<string, string | undefined>>,
  ) => void;
}): ReactElement {
  const [params] = useSearchParams();
  return (
    <PeopleStatCards
      active={{
        employmentStatus: params.get('employmentStatus') ?? undefined,
        sort: params.get('sort') ?? undefined,
      }}
      onFilter={onFilter}
    />
  );
}

// ---------------------------------------------------------------- detail

/** A tree node's ancestors, each a link, after the list in the breadcrumb. */
export function AncestorsTrail({
  collection,
  record,
}: {
  readonly collection: MasterDataCollection;
  readonly record: ItamRecord;
}): ReactElement {
  const stats = useMasterStats(collection.name, record.id);
  return (
    <>
      {(stats.data?.ancestors ?? []).map((entry) => (
        <span key={entry.id} className='inline-flex items-center gap-1'>
          <span aria-hidden='true'>›</span>
          <Link
            to={`/${collection.route}/${entry.id}`}
            className='hover:text-foreground'
          >
            {entry.name}
          </Link>
        </span>
      ))}
    </>
  );
}

/** A category's extended-field template, with how many records use each. */
export function CategoryTemplate({
  record,
}: {
  readonly record: ItamRecord;
}): ReactElement {
  const path = masterDataPath('categories');
  const stats = useMasterStats('categories', record.id);
  const mutations = useItamMutations<ItamRecord>(path);
  const permissions = useCollectionPermissions('categories', [
    'update',
    'delete',
  ]);
  return (
    <FieldTemplateEditor
      key={JSON.stringify(record.fieldTemplate ?? null)}
      value={record.fieldTemplate}
      editable={Boolean(permissions.update)}
      usage={stats.data?.attributeUsage}
      onSave={async (template) => {
        try {
          await mutations.update.mutateAsync({
            id: record.id,
            input: { fieldTemplate: template },
          });
        } catch (error) {
          throw new Error(apiErrorBody(error)?.message ?? errorMessage(error), {
            cause: error,
          });
        }
      }}
    />
  );
}

/** A model's or product's device type, read from its category. */
export function CategoryKindValue({
  categoryId,
}: {
  readonly categoryId: unknown;
}): ReactElement | null {
  const category = useItamRecord<ItamRecord>(
    masterDataPath('categories'),
    text(categoryId) || undefined,
  );
  const appliesTo = text(category.data?.appliesTo);
  return appliesTo ? <AssetTypeBadge value={appliesTo} /> : null;
}

/** 创建子分类 / 子位置 / 子部门: a child starts from its parent's rules. */
export function NewChildAction({
  collection,
  record,
}: {
  readonly collection: MasterDataCollection;
  readonly record: ItamRecord;
}): ReactElement | null {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const mutations = useItamMutations<ItamRecord>(
    masterDataPath(collection.name),
  );
  const permissions = useCollectionPermissions(collection.name, ['create']);
  if (!permissions.create) return null;
  const fields = collection.fields;
  return (
    <>
      <Button variant='outline' onClick={() => setOpen(true)}>
        <Plus data-icon='inline-start' />
        {t(`${collection.i18n}.newChild`)}
      </Button>
      <RecordFormDialog
        key={open ? 'child' : 'child-closed'}
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) mutations.create.reset();
        }}
        title={t(`${collection.i18n}.newChild`)}
        fields={fields}
        initial={{
          ...Object.fromEntries(
            fields
              .filter(
                (field) =>
                  field.form !== false &&
                  ![
                    collection.nameField,
                    'parentId',
                    'sort',
                    'code',
                    'costCenter',
                    'address',
                    'type',
                    'notes',
                  ].includes(field.key),
              )
              .map((field) => [
                field.key,
                field.type === 'boolean'
                  ? Boolean(record[field.key])
                  : (record[field.key] ?? null),
              ]),
          ),
          parentId: record.id,
        }}
        submitting={mutations.create.isPending}
        error={mutations.create.error}
        onSubmit={async (values) => {
          const created = await mutations.create.mutateAsync({
            ...values,
            parentId: record.id,
            // A sub-category starts with its parent's extended fields.
            ...(collection.name === 'categories' &&
            Array.isArray(record.fieldTemplate)
              ? { fieldTemplate: record.fieldTemplate }
              : {}),
          });
          setOpen(false);
          await navigate(`/${collection.route}/${created.id}`);
        }}
      />
    </>
  );
}

export function MasterActions({
  collection,
  record,
}: {
  readonly collection: MasterDataCollection;
  readonly record: ItamRecord;
}): ReactElement {
  return (
    <>
      {collection.name === 'people' ? <PersonActions record={record} /> : null}
      {collection.tree ? (
        <NewChildAction collection={collection} record={record} />
      ) : null}
    </>
  );
}
