import { useTranslation } from '@nocobase/i18n/client';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';

import { AiShortcut } from '@/components/itam/ai/ai-shortcut';
import { AssetTypeBadge } from '@/components/itam/asset-type-badge';
import { EmptyState } from '@/components/itam/empty-state';
import { CategoryCreateDialog } from '@/components/itam/category-create-dialog';
import { ManufacturerCaptureDialog } from '@/components/itam/manufacturer-capture-dialog';
import { MasterCreateDialog } from '@/components/itam/master-create-dialog';
import { FieldTemplateEditor } from '@/components/itam/field-template-editor';
import { parseTemplate } from '@/lib/itam/field-template';
import { MasterDataTree } from '@/components/itam/master-data-tree';
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
import { useItamAi } from '@/lib/itam/ai-chat';
import {
  isMasterCaptureCollection,
  type MasterCaptureCollection,
} from '@/lib/itam/master-capture';
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
 * since the kind and the count are on the record, but a department's
 * people — and the clicked node's
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
  // Nothing chosen opens the first place at the top of the tree
  // (2026-10-21; an empty pane asking for a click until then), as does the
  // one left after the open record is deleted.
  const first = nodes?.find((node) => !node.parentId) ?? nodes?.[0];
  useEffect(() => {
    if (gone) select(undefined);
    else if (!selected && first) select(String(first.id));
  });
  return (
    // As tall as the page leaves (`treeFills`): each pane scrolls on its
    // own, so a long tree never pushes the record out of view; each keeps
    // room at its end for the ask box over the page's foot (page-header.tsx).
    <div className='grid min-h-80 flex-1 gap-4 @xl:grid-cols-[minmax(13rem,17rem)_minmax(0,1fr)] @xl:grid-rows-[minmax(0,1fr)]'>
      <div className='min-h-0 overflow-y-auto [:root[data-ask-dock]_&]:pb-16'>
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
                    // On hover, on the open row or on focus (2026-10-21):
                    // a bin on every row read as clutter; a touch screen,
                    // which cannot hover, keeps them all.
                    className='text-muted-foreground opacity-0 group-data-selected/tree-row:opacity-100 group-hover/tree-row:opacity-100 hover:text-destructive focus-visible:opacity-100 pointer-coarse:opacity-100'
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
        // The scrollbar's room is kept whether or not the record scrolls
        // (2026-10-21): a long history's scrollbar narrowed the pane below
        // the detail page's two-column width, so one record stacked and the
        // next sat side by side on the same screen.
        <section className='min-h-0 min-w-0 overflow-y-auto rounded-lg border border-border bg-card [scrollbar-gutter:stable] [:root[data-ask-dock]_&]:pb-16'>
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

/** The category's device type, before the category itself. */
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
 * 设备 or 库存 on hand (2026-10-21): the record's devices, or its stock
 * units; a dash in the column of the kind its category does not hold (a
 * model has one or the other).
 */
export function OnHandCell({
  countField,
  kind,
  row,
}: {
  readonly countField: string;
  readonly kind: 'device' | 'stock';
  readonly row: ItamRecord;
}): ReactElement {
  const devices = useCountsBy(DEVICES_PATH, countField);
  const stock = useCountsBy(STOCK_PATH, countField);
  const categories = useCategoryKinds();
  if (!devices.data || !stock.data) return <></>;
  const applies = appliesToOf(categories.data?.data, row);
  const holds = applies === 'device' || !applies ? 'device' : 'stock';
  if (holds !== kind) return <span className='text-muted-foreground'>—</span>;
  const total =
    kind === 'device' ? (devices.data[row.id] ?? 0) : (stock.data[row.id] ?? 0);
  return <>{total.toLocaleString()}</>;
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
  // The card edits the fields by hand; 完善, in the page's header, suggests
  // (2026-10-20).
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
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const mutations = useItamMutations<ItamRecord>(
    masterDataPath(collection.name),
  );
  const permissions = useCollectionPermissions(collection.name, ['create']);
  if (!permissions.create) return null;
  const fields = collection.fields;
  // Beside the tree (its page with ?selected=), the child is selected in
  // it; on the record's own page, the child's page opens (2026-10-20).
  const createdPath = (id: unknown) =>
    new URLSearchParams(location.search).has('selected')
      ? `/${collection.route}?selected=${encodeURIComponent(String(id))}`
      : `/${collection.route}/${String(id)}`;
  const childInitial = {
    ...Object.fromEntries(
      fields
        .filter(
          (field) =>
            field.form !== false &&
            ![
              collection.nameField,
              'parentId',
              'sort',
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
  };
  return (
    <>
      <Button variant='outline' onClick={() => setOpen(true)}>
        <Plus data-icon='inline-start' />
        {t(`${collection.i18n}.newChild`)}
      </Button>
      {/* A sub-category is created with AI 整理 too (2026-10-20), keeping
          its parent's extended fields. */}
      {collection.name === 'categories' ? (
        <CategoryCreateDialog
          open={open}
          onOpenChange={setOpen}
          title={t(`${collection.i18n}.newChild`)}
          initial={childInitial}
          baseTemplate={parseTemplate(record.fieldTemplate)}
          onCreated={(created) => {
            void navigate(createdPath(created.id));
          }}
        />
      ) : (
        <RecordFormDialog
          key={open ? 'child' : 'child-closed'}
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) mutations.create.reset();
          }}
          title={t(`${collection.i18n}.newChild`)}
          fields={fields}
          initial={childInitial}
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
            await navigate(createdPath(created.id));
          }}
        />
      )}
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
      {isMasterCaptureCollection(collection.name) ? (
        <EnrichAction collection={collection.name} record={record} />
      ) : null}
      {collection.name === 'people' ? <PersonActions record={record} /> : null}
      {collection.name === 'categories' ? (
        <RefineCategoryAction record={record} />
      ) : null}
      {collection.name === 'manufacturers' ? (
        <RefineManufacturerAction record={record} />
      ) : null}
      {collection.tree ? (
        <NewChildAction collection={collection} record={record} />
      ) : null}
    </>
  );
}

/**
 * 完善 on a category's page (2026-10-20): the model suggests its rules,
 * defaults and extended fields at once, in the dialog that creates one,
 * marked 修改 and 新增 against what it holds; the reader saves or drops them.
 * For whoever may change the category, while a model is there.
 */
function RefineCategoryAction({
  record,
}: {
  readonly record: ItamRecord;
}): ReactElement | null {
  const { t } = useTranslation();
  const ai = useItamAi();
  const permissions = useCollectionPermissions('categories', ['update']);
  const [open, setOpen] = useState(false);
  if (!ai.available || !permissions.update) return null;
  return (
    <>
      <AiShortcut onClick={() => setOpen(true)}>
        {t('categories.refine')}
      </AiShortcut>
      <CategoryCreateDialog
        open={open}
        onOpenChange={setOpen}
        record={record}
        onCreated={() => setOpen(false)}
      />
    </>
  );
}

/**
 * 完善 on a manufacturer's page (2026-10-21): its site and support looked
 * up on the web and checked against what it holds, marked 修改 where they
 * differ. For whoever may change the maker, while a model is there.
 */
function RefineManufacturerAction({
  record,
}: {
  readonly record: ItamRecord;
}): ReactElement | null {
  const { t } = useTranslation();
  const ai = useItamAi();
  const permissions = useCollectionPermissions('manufacturers', ['update']);
  const [open, setOpen] = useState(false);
  if (!ai.available || !permissions.update) return null;
  return (
    <>
      <AiShortcut onClick={() => setOpen(true)}>
        {t('masterEnrich.action')}
      </AiShortcut>
      <ManufacturerCaptureDialog
        open={open}
        onOpenChange={setOpen}
        record={record}
        onCreated={() => setOpen(false)}
      />
    </>
  );
}

/**
 * 完善 on a model's or software product's page: until 2026-10-21 it asked
 * Asset Steward in the chat (AI 补充 until 2026-10-20); now it opens the
 * record's own form, as a category's 完善 does (2026-10-21). The reading —
 * the web too, with a DeepSeek model service — checks and completes the
 * record, the form marks 修改 where it differs, and saving writes it with
 * the AI tag in its history. For whoever may change the record, while a
 * model is there.
 */
function EnrichAction({
  collection,
  record,
}: {
  readonly collection: MasterCaptureCollection;
  readonly record: ItamRecord;
}): ReactElement | null {
  const { t } = useTranslation();
  const ai = useItamAi();
  const permissions = useCollectionPermissions(collection, ['update']);
  const [open, setOpen] = useState(false);
  if (!ai.available || !permissions.update) return null;
  return (
    <>
      <AiShortcut onClick={() => setOpen(true)}>
        {t('masterEnrich.action')}
      </AiShortcut>
      <MasterCreateDialog
        collection={collection}
        open={open}
        onOpenChange={setOpen}
        record={record}
        onCreated={() => setOpen(false)}
      />
    </>
  );
}
