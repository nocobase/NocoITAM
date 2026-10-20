import { useTranslation } from '@nocobase/i18n/client';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';

import { AiShortcut } from '@/components/itam/ai/ai-shortcut';
import { AssetTypeBadge } from '@/components/itam/asset-type-badge';
import { EmptyState } from '@/components/itam/empty-state';
import { CategoryCreateDialog } from '@/components/itam/category-create-dialog';
import { CategoryDefaultsSuggestion } from '@/components/itam/category-defaults-suggestion';
import {
  FieldTemplateEditor,
  type FieldChange,
} from '@/components/itam/field-template-editor';
import { categoryDefaultsOf } from '@/lib/itam/category-defaults';
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
import { useAiStatus } from '@/lib/itam/ai';
import { useAiPageContext, useAiReading, useItamAi } from '@/lib/itam/ai-chat';
import { useReferenceNames } from '@/lib/itam/references';
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
        <section className='min-h-0 min-w-0 overflow-y-auto rounded-lg border border-border bg-card [:root[data-ask-dock]_&]:pb-16'>
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
  const ai = useItamAi();
  const read = useAiReading();
  return (
    <FieldTemplateEditor
      key={JSON.stringify(record.fieldTemplate ?? null)}
      value={record.fieldTemplate}
      editable={Boolean(permissions.update)}
      usage={stats.data?.attributeUsage}
      // AI 建议字段 (2026-10-20): the server reads the category and the
      // fields of its kind's other categories (`categoryFields`).
      {...(ai.available
        ? {
            onSuggest: async (current) => {
              const answer = await read({
                task: 'categoryFields',
                material: text(record.name) || 'category',
                context: {
                  categoryId: text(record.id),
                  currentFields: current,
                },
              });
              const reading = answer.reading as {
                fields?: unknown;
                changes?: unknown;
                defaults?: unknown;
              } | null;
              return {
                fields: parseTemplate(reading?.fields),
                // Changes to the fields it has, by key; the editor checks
                // the type.
                changes: Array.isArray(reading?.changes)
                  ? (reading.changes as FieldChange[]).filter(
                      (change) => typeof change?.key === 'string',
                    )
                  : [],
                said: answer.said,
                // The defaults too: those that differ, with 采用.
                extra: (
                  <CategoryDefaultsSuggestion
                    record={record}
                    defaults={categoryDefaultsOf(reading?.defaults)}
                    onApply={async (values) => {
                      await mutations.update.mutateAsync({
                        id: record.id,
                        input: values,
                      });
                    }}
                  />
                ),
              };
            },
          }
        : {})}
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
      {collection.tree ? (
        <NewChildAction collection={collection} record={record} />
      ) : null}
    </>
  );
}

/**
 * AI 补充 on a model's or software product's page (2026-10-06): opens the
 * assistant's panel on a new conversation and asks Asset Steward to check the record
 * under the catalog skill, with the record as page context. Asset Steward says what
 * it found and proposes the change as a plan (`update_master_record`), whose
 * card the user confirms or declines. There is no web search on the Agents
 * plugin's chat (template 1.0.0-beta.64). Offered to whoever may edit the
 * record, while the assistant is available.
 */
function EnrichAction({
  collection,
  record,
}: {
  readonly collection: MasterCaptureCollection;
  readonly record: ItamRecord;
}): ReactElement | null {
  const ai = useItamAi();
  const permissions = useCollectionPermissions(collection, ['update']);
  if (!ai.available || !permissions.update) return null;
  return <EnrichShortcut collection={collection} record={record} />;
}

/**
 * The shortcut itself: the record is the chat's page context, and the
 * assistant reads it and its category's fields with its tools — the web
 * too, with a DeepSeek model service — then proposes the empty fields it
 * can fill as a plan (the catalog skill).
 */
function EnrichShortcut({
  collection,
  record,
}: {
  readonly collection: MasterCaptureCollection;
  readonly record: ItamRecord;
}): ReactElement {
  const { t } = useTranslation();
  const names = useReferenceNames([
    { collection: 'manufacturers', ids: [text(record.manufacturerId)] },
  ]);
  const maker = names.manufacturers?.get(text(record.manufacturerId)) ?? '';
  const web = useAiStatus().data?.webSearch === true;
  const { ask } = useAiPageContext({
    kind: collection,
    id: text(record.id),
    label: text(record.name),
  });
  return (
    <AiShortcut
      onClick={() =>
        ask(
          t(
            collection === 'models'
              ? 'ai.prompts.enrichModel'
              : 'ai.prompts.enrichSoftwareProduct',
            {
              name: [maker, text(record.name)].filter(Boolean).join(' '),
              search: t(
                web ? 'ai.prompts.masterSearch' : 'ai.prompts.masterNoSearch',
              ),
            },
          ),
        )
      }
    >
      {t('masterEnrich.action')}
    </AiShortcut>
  );
}
