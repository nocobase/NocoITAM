import { AssetTypeBadge } from './asset-type-badge.js';
import { useOpenRecord } from '@/lib/itam/record-drawer';
import { useTranslation } from '@nocobase/i18n/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, type ReactElement, type ReactNode } from 'react';

import {
  apiErrorBody,
  masterDataPath,
  useApi,
  useItamList,
  type ItamRecord,
} from '@/lib/itam/api';
import { DEVICES_PATH } from '@/lib/itam/device-api';
import { STOCK_PATH } from '@/lib/itam/stock';
import { errorMessage, text } from '@/lib/itam/format';
import type { MasterDataCollection } from '@/lib/itam/master-data';
import { useCollectionPermissions } from '@/lib/itam/permissions';
import { groupedMove } from '@/lib/itam/tree-move';

import { EmptyState } from './empty-state.js';
import { TreeView } from './tree-view.js';

/** The five asset types, in the order the application lists them. */
const APPLIES_TO = [
  'device',
  'accessory',
  'consumable',
  'component',
  'entitlement',
] as const;

const COUNT_FIELD: Readonly<Record<string, string>> = {
  locations: 'locationId',
  departments: 'departmentId',
  categories: 'categoryId',
};

/**
 * Tree view for locations, departments and categories with device counts per
 * node. Master-data trees are small; the page loads up to 200 nodes per
 * request and reports when more exist.
 */
export function MasterDataTree({
  collection,
  expandAll,
  search = '',
  filter = {},
  rowActions,
  compact = false,
  selectedId,
  onSelect,
}: {
  readonly collection: MasterDataCollection;
  readonly expandAll?: boolean;
  /** Free text: matching nodes and their ancestors stay visible. */
  readonly search?: string;
  /** Field equality filters applied the same way. */
  readonly filter?: Readonly<Record<string, string | undefined>>;
  /** Per-row menu (edit, delete) rendered at the end of the row. */
  readonly rowActions?: (row: ItamRecord) => ReactNode;
  /**
   * The names alone, for a narrow column beside the record (the categories
   * page): no kind tag and no count.
   */
  readonly compact?: boolean;
  readonly selectedId?: string;
  /** Replaces opening the node in the record drawer. */
  readonly onSelect?: (id: string) => void;
}): ReactElement {
  const { t } = useTranslation();
  // A node opens in the record drawer rather than taking the reader off
  // the tree: the tree is the map, and reading one node should not lose
  // the reader's place in it.
  const openRecord = useOpenRecord();
  const api = useApi();
  const queryClient = useQueryClient();
  const permissions = useCollectionPermissions(collection.name, ['update']);
  const move = useMutation({
    mutationFn: (input: {
      id: string;
      parentId: string | null;
      index: number;
    }) =>
      api.request({
        path: `${masterDataPath(collection.name)}/${input.id}/move`,
        method: 'POST',
        json: { parentId: input.parentId, index: input.index },
      }),
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: ['itam', masterDataPath(collection.name)],
      }),
  });
  const list = useItamList<ItamRecord>(masterDataPath(collection.name), {
    pageSize: 200,
    sort: 'sort',
  });
  const countField = COUNT_FIELD[collection.name];
  const counts = useQuery({
    queryKey: ['itam', DEVICES_PATH, 'counts', countField],
    queryFn: async () =>
      (
        await api.request<{ data: Record<string, number> }>({
          path: `${DEVICES_PATH}/counts`,
          query: { by: countField },
        })
      ).data,
    enabled: Boolean(countField),
  });
  // Categories count what they apply to: devices, stock on hand, or
  // software products; the other trees count devices.
  const isCategories = collection.name === 'categories';
  const stockCounts = useQuery({
    queryKey: ['itam', STOCK_PATH, 'counts', 'categoryId'],
    enabled: isCategories,
    queryFn: async () =>
      (
        await api.request<{ data: Record<string, number> }>({
          path: `${STOCK_PATH}/counts`,
          query: { by: 'categoryId' },
        })
      ).data,
  });
  // Software categories count their entitlements, the record level, like
  // devices and stock for the rest.
  const entitlementCounts = useQuery({
    queryKey: ['itam', masterDataPath('categories'), 'counts'],
    enabled: isCategories,
    queryFn: async () =>
      (
        await api.request<{ data: Record<string, Record<string, number>> }>({
          path: `${masterDataPath('categories')}/counts`,
        })
      ).data,
  });
  const deviceCounts = counts.data;
  const stockByCategory = stockCounts.data;
  const software = entitlementCounts.data?.entitlements ?? {};
  const rows = list.data?.data ?? [];
  let mergedCounts = deviceCounts;
  if (isCategories) {
    const merged: Record<string, number> = {};
    for (const row of rows) {
      const applies = text(row.appliesTo);
      merged[row.id] =
        applies === 'device'
          ? (deviceCounts?.[row.id] ?? 0)
          : applies === 'entitlement'
            ? (software[row.id] ?? 0)
            : (stockByCategory?.[row.id] ?? 0);
    }
    mergedCounts = merged;
  }
  // Each row shows its kind (applies-to or location type) and last update.
  const kindField = collection.fields.find(
    (field) => field.key === 'appliesTo' || field.key === 'type',
  );
  // Searching a tree keeps the matches and every ancestor so the path reads.
  const active = Object.entries(filter).filter(([, v]) => v);
  const needle = search.trim().toLowerCase();
  const allRows = list.data?.data ?? [];
  const byId = new Map(allRows.map((row) => [row.id, row]));
  const matches = (row: ItamRecord) =>
    (!needle ||
      text(row[collection.nameField]).toLowerCase().includes(needle)) &&
    active.every(([key, value]) => {
      const held = row[key];
      return Array.isArray(held)
        ? held.map(text).includes(String(value))
        : text(held) === String(value);
    });
  const keep = new Set<string>();
  if (needle || active.length > 0) {
    for (const row of allRows) {
      if (!matches(row)) continue;
      let current: ItamRecord | undefined = row;
      while (current && !keep.has(current.id)) {
        keep.add(current.id);
        current =
          typeof current.parentId === 'string'
            ? byId.get(current.parentId)
            : undefined;
      }
    }
  }
  const filtering = needle.length > 0 || active.length > 0;
  const visibleRows = filtering
    ? allRows.filter((row) => keep.has(row.id))
    : allRows;
  const nodes = useMemo(
    () =>
      visibleRows.map((row) => {
        const option = kindField?.options?.find(
          (candidate) => candidate.value === text(row[kindField.key]),
        );
        return {
          id: row.id,
          parentId: row.parentId as string | null,
          label: text(row[collection.nameField]),
          sort: typeof row.sort === 'number' ? row.sort : 0,
          details: [
            ...(kindField && !compact
              ? [
                  {
                    key: 'kind',
                    // Categories say what they apply to; other trees show
                    // the node's type.
                    value:
                      kindField.key === 'appliesTo' ? (
                        <AssetTypeBadge value={row[kindField.key]} />
                      ) : (
                        `${t(kindField.key === 'appliesTo' ? 'tree.kindPrefix' : 'tree.typePrefix')}${option ? t(option.label) : text(row[kindField.key])}`
                      ),
                    width: 'w-32',
                  },
                ]
              : []),
          ],
        };
      }),
    [visibleRows, collection.nameField, kindField, compact, t],
  );
  const tree = (treeNodes: typeof nodes, group?: string) => (
    <TreeView
      bare={group !== undefined}
      key={`${group ?? ''}-${expandAll === false && !filtering ? 'collapsed' : 'expanded'}-${filtering ? needle : ''}`}
      defaultCollapsed={expandAll === false && !filtering}
      nodes={treeNodes}
      counts={compact ? undefined : mergedCounts}
      countLabel={(node) => {
        const applies = isCategories
          ? text(rows.find((row) => row.id === node.id)?.appliesTo)
          : 'device';
        return t(
          applies === 'device'
            ? 'tabs.devices'
            : applies === 'entitlement'
              ? 'entitlements.object'
              : 'tabs.stock',
        );
      }}
      selectedId={selectedId}
      onSelect={onSelect ?? ((id) => openRecord(`/${collection.route}/${id}`))}
      onMove={
        permissions.update
          ? (next) =>
              move.mutate(
                group
                  ? groupedMove(
                      allRows,
                      next,
                      (row) => text(row.appliesTo) === group,
                    )
                  : next,
              )
          : undefined
      }
      rowActions={
        rowActions
          ? (id) => {
              const row = byId.get(id);
              return row ? rowActions(row) : null;
            }
          : undefined
      }
    />
  );
  // The categories page groups the tree by what a category applies to: a
  // top-level category chooses its asset type and its subtree inherits it,
  // so every tree falls in exactly one group, and a node can only be
  // dragged within its own (the service refuses another type's parent).
  const grouped = isCategories && compact;
  if (list.data && list.data.total === 0)
    return <EmptyState title={t(`${collection.i18n}.empty`)} />;
  if (list.data && filtering && visibleRows.length === 0)
    return <EmptyState title={t('common.noResults')} />;
  return (
    <div className='space-y-2'>
      {grouped ? (
        <div className='space-y-3 rounded-lg border border-border bg-card p-2'>
          {APPLIES_TO.map((kind) => {
            const kindNodes = nodes.filter(
              (node) => text(byId.get(node.id)?.appliesTo) === kind,
            );
            if (filtering && kindNodes.length === 0) return null;
            return (
              <section key={kind} className='space-y-1'>
                <h3 className='px-1 pt-1'>
                  <AssetTypeBadge value={kind} />
                </h3>
                {kindNodes.length > 0 ? (
                  tree(kindNodes, kind)
                ) : (
                  <p className='px-2 py-1 text-xs text-muted-foreground'>
                    {t('categories.noneOfKind')}
                  </p>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        tree(nodes)
      )}
      {move.error ? (
        <p className='text-sm text-destructive'>
          {apiErrorBody(move.error)?.message ?? errorMessage(move.error)}
        </p>
      ) : null}
      {permissions.update ? (
        <p className='text-xs text-muted-foreground'>{t('tree.dragHint')}</p>
      ) : null}
      {list.data && list.data.total > allRows.length ? (
        <p className='text-xs text-muted-foreground'>
          {t('tree.truncated', {
            shown: allRows.length,
            total: list.data.total,
          })}
        </p>
      ) : null}
    </div>
  );
}
