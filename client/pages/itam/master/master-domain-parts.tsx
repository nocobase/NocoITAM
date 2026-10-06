import { useTranslation } from '@nocobase/i18n/client';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';

import { AssetTypeBadge } from '@/components/itam/asset-type-badge';
import { FieldTemplateEditor } from '@/components/itam/field-template-editor';
import { MasterDataTree } from '@/components/itam/master-data-tree';
import { PeopleStatCards } from '@/components/itam/people-stats';
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
      // Software products keep no values; everything else has a model.
      scopes={record.appliesTo !== 'entitlement'}
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
