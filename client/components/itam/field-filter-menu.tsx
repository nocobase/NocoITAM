import { useTranslation } from '@nocobase/i18n/client';
import { useQueries } from '@tanstack/react-query';
import { useEffect, useState, type ReactElement } from 'react';

import {
  type FilterDimension,
  type FilterKeyword,
  FilterMenu,
} from '#components/filter-menu';
import {
  listQueryParams,
  useApi,
  type ItamRecord,
  type ListQuery,
  type ListResponse,
} from '@/lib/itam/api';
import type { FieldDefinition } from '@/lib/itam/fields';
import { masterDataByName } from '@/lib/itam/master-data';
import {
  referenceLabel,
  referencePath,
  useReferenceNames,
} from '@/lib/itam/references';

/**
 * A list's search and filter fields as the Filters menu in its header: the
 * keyword box first, then a select's
 * values as they are, a reference's records read from its collection once
 * the menu is first opened — a tree (categories, locations, departments)
 * whole and indented, any other collection searched on the server by the
 * box above its values. Values live in the URL under the field key, so a filtered list is
 * shareable.
 */
export function FieldFilterMenu({
  fields,
  value,
  onChange,
  onClear,
  keyword,
}: {
  readonly fields: readonly FieldDefinition[];
  readonly value: Readonly<Record<string, string | undefined>>;
  readonly onChange: (key: string, next: string | undefined) => void;
  readonly onClear: () => void;
  /** The list's own search, at the top of the menu. */
  readonly keyword?: FilterKeyword;
}): ReactElement | null {
  const { t } = useTranslation();
  const api = useApi();
  // The reference values are read only once someone looks for them.
  const [opened, setOpened] = useState(false);
  const [searches, setSearches] = useState<Record<string, string>>({});
  const searched = useDebounced(searches);

  const references = fields.filter(
    (field) => field.type === 'reference' && field.reference,
  );
  const queries = useQueries({
    queries: references.map((field) => {
      const collection = field.reference!.collection;
      const tree = Boolean(masterDataByName(collection)?.tree);
      const path = referencePath(collection);
      const query: ListQuery = {
        q: tree ? '' : (searched[field.key] ?? '').trim(),
        pageSize: tree ? 500 : 20,
        sort: tree ? 'sort' : undefined,
        filter: field.reference!.filter,
      };
      return {
        // The key the reference pickers use, so the two share what was read.
        queryKey: ['itam', path, 'list', query],
        queryFn: () =>
          api.request<ListResponse<ItamRecord>>({
            path,
            query: listQueryParams(query),
          }),
        enabled: opened,
        placeholderData: (previous: ListResponse<ItamRecord> | undefined) =>
          previous,
      };
    }),
  });
  // The applied references by name, for their chips before the menu opens.
  const names = useReferenceNames(
    references.map((field) => ({
      collection: field.reference!.collection,
      ids: [value[field.key]],
    })),
  );

  const dimensions: FilterDimension[] = fields.map((field) => {
    const applied = value[field.key] ?? null;
    const base = {
      key: field.key,
      label: t(field.label),
      value: applied,
      onChange: (next: string | null) => onChange(field.key, next ?? undefined),
    };
    if (!(field.type === 'reference' && field.reference))
      return {
        ...base,
        options: (field.options ?? []).map((option) => ({
          value: option.value,
          label: t(option.label),
        })),
      };
    const collection = field.reference.collection;
    const rows = queries[references.indexOf(field)]?.data?.data ?? [];
    const tree = Boolean(masterDataByName(collection)?.tree);
    return {
      ...base,
      options: (tree
        ? treeOrder(rows)
        : rows.map((row) => ({ row, depth: 0 }))
      ).map(({ row, depth }) => ({
        value: row.id,
        label: referenceLabel(collection, row),
        depth,
      })),
      valueLabel: applied ? names[collection]?.get(applied) : undefined,
      // A tree is read whole and narrowed in the menu; any other
      // collection on the server as it is typed.
      search: tree
        ? { placeholder: t('listFilters.searchIn', { field: t(field.label) }) }
        : {
            value: searches[field.key] ?? '',
            onChange: (next: string) =>
              setSearches((current) => ({ ...current, [field.key]: next })),
            placeholder: t('listFilters.searchIn', { field: t(field.label) }),
          },
    };
  });

  return (
    <FilterMenu
      dimensions={dimensions}
      keyword={keyword}
      onClear={onClear}
      onOpenChange={(open) => {
        if (open) setOpened(true);
      }}
    />
  );
}

/** A tree's records parent first, each with its depth. */
function treeOrder(
  rows: readonly ItamRecord[],
): { row: ItamRecord; depth: number }[] {
  const ids = new Set(rows.map((row) => row.id));
  const byParent = new Map<string | null, ItamRecord[]>();
  for (const row of rows) {
    const parent =
      typeof row.parentId === 'string' && ids.has(row.parentId)
        ? row.parentId
        : null;
    byParent.set(parent, [...(byParent.get(parent) ?? []), row]);
  }
  const ordered: { row: ItamRecord; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const row of byParent.get(parent) ?? []) {
      ordered.push({ row, depth });
      walk(row.id, depth + 1);
    }
  };
  walk(null, 0);
  return ordered;
}

/** `value` once it has stayed the same for a moment: a search box's text, sent when typing stops. */
function useDebounced<T>(value: T): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => setSettled(value), 250);
    return () => clearTimeout(handle);
  }, [value]);
  return settled;
}
