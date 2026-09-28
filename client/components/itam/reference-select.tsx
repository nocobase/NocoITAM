import { AssetTypeBadge } from '@/components/itam/asset-type-badge';
import { useTranslation } from '@nocobase/i18n/client';
import { ChevronsUpDown, X } from 'lucide-react';
import { useMemo, useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useItamList, useItamRecord, type ItamRecord } from '@/lib/itam/api';
import { text } from '@/lib/itam/format';
import type { ReferenceTarget } from '@/lib/itam/fields';
import { masterDataByName } from '@/lib/itam/master-data';
import {
  referenceLabel,
  referencePath,
  useReferenceNames,
} from '@/lib/itam/references';
import { treePathLabel } from '@/lib/itam/tree';
import { cn } from '@/lib/utils';

export interface ReferenceSelectProps {
  readonly reference: ReferenceTarget;
  readonly value: string | null | undefined;
  /** The chosen record travels with its id so a form can derive other fields from it. */
  readonly onChange: (value: string | null, record?: ItamRecord) => void;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  /** Excluded from the options (a record cannot be its own parent). */
  readonly excludeId?: string;
  readonly id?: string;
  readonly className?: string;
  /** Open the list immediately, e.g. when editing a field in place. */
  readonly defaultOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
}

/** A searchable single-select that queries the server as the user types. */
export function ReferenceSelect({
  reference,
  value,
  onChange,
  placeholder,
  disabled,
  excludeId,
  id,
  className,
  defaultOpen = false,
  onOpenChange,
}: ReferenceSelectProps): ReactElement {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);
  const changeOpen = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };
  const [search, setSearch] = useState('');
  const path = referencePath(reference.collection);
  // Trees (categories, locations, departments) are shown whole and indented
  // by depth; flat collections page through search results.
  const tree = Boolean(masterDataByName(reference.collection)?.tree);
  const options = useItamList<ItamRecord>(
    path,
    {
      q: search,
      pageSize: tree ? 500 : 20,
      sort: tree ? 'sort' : undefined,
      filter: reference.filter,
    },
    { enabled: open },
  );
  // The record being edited stays visible but cannot be chosen; in a tree
  // its whole subtree is greyed out too (a node cannot move under itself).
  // Stable across renders: the classifier lookup below keys its queries on
  // this list, and a fresh array each render would re-run them forever.
  const rows = useMemo(() => options.data?.data ?? [], [options.data]);
  const ordered: { row: ItamRecord; depth: number; disabled: boolean }[] = [];
  if (tree) {
    const ids = new Set(rows.map((row) => row.id));
    const byParent = new Map<string | null, ItamRecord[]>();
    for (const row of rows) {
      const parent =
        typeof row.parentId === 'string' && ids.has(row.parentId)
          ? row.parentId
          : null;
      byParent.set(parent, [...(byParent.get(parent) ?? []), row]);
    }
    const walk = (parent: string | null, depth: number, blocked: boolean) => {
      for (const row of byParent.get(parent) ?? []) {
        const disabled = blocked || row.id === excludeId;
        ordered.push({ row, depth, disabled });
        walk(row.id, depth + 1, disabled);
      }
    };
    walk(null, 0, false);
  } else {
    for (const row of rows)
      ordered.push({ row, depth: 0, disabled: row.id === excludeId });
  }
  // A model or a software product reads with what classifies it: two of
  // them may share a name, and the category and maker are what tell them
  // apart at the moment of choosing.
  const classified =
    reference.collection === 'models' ||
    reference.collection === 'softwareProducts';
  const classifiers = useMemo(
    () =>
      classified
        ? [
            {
              collection: 'categories',
              ids: rows.map((row) => row.categoryId as string | null),
            },
            {
              collection: 'manufacturers',
              ids: rows.map((row) => row.manufacturerId as string | null),
            },
          ]
        : [],
    [classified, rows],
  );
  const classifierNames = useReferenceNames(classifiers);
  const classifierOf = (row: ItamRecord): string =>
    [
      classifierNames.categories?.get(text(row.categoryId)),
      classifierNames.manufacturers?.get(text(row.manufacturerId)),
    ]
      .filter(Boolean)
      .join(' · ');

  const selected = useItamRecord<ItamRecord>(path, value ?? undefined);
  // A chosen tree node reads with its ancestors: 技术部 › 研发.
  const treeNodes = useItamList<ItamRecord>(
    path,
    { pageSize: 500 },
    { enabled: tree && Boolean(value) },
  );
  const selectedLabel = value
    ? tree && treeNodes.data
      ? treePathLabel(treeNodes.data.data, value) || '…'
      : selected.data
        ? referenceLabel(reference.collection, selected.data)
        : '…'
    : undefined;

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            variant='outline'
            role='combobox'
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              'w-full justify-between font-normal',
              !value && 'text-muted-foreground',
              className,
            )}
          />
        }
      >
        <span className='truncate'>
          {selectedLabel ?? placeholder ?? t('common.select')}
        </span>
        <span className='flex items-center gap-1'>
          {value && !disabled ? (
            <X
              className='size-3.5 opacity-60 hover:opacity-100'
              aria-label={t('common.clear')}
              onClick={(event) => {
                event.stopPropagation();
                onChange(null);
              }}
            />
          ) : null}
          <ChevronsUpDown className='size-3.5 opacity-50' />
        </span>
      </PopoverTrigger>
      <PopoverContent className='w-(--anchor-width) min-w-64 p-0' align='start'>
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t('common.searchPlaceholder')}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {options.isLoading ? t('common.loading') : t('common.noResults')}
            </CommandEmpty>
            <CommandGroup>
              {ordered.map(({ row, depth, disabled: unavailable }) => (
                <CommandItem
                  key={row.id}
                  value={row.id}
                  disabled={unavailable}
                  // The primitive's trailing check shows for the chosen row;
                  // hiding it elsewhere keeps the right edge tight.
                  data-checked={row.id === value}
                  className='[&>svg:last-child]:hidden data-[checked=true]:[&>svg:last-child]:block'
                  onSelect={() => {
                    if (row.id === value) onChange(null);
                    else onChange(row.id, row);
                    changeOpen(false);
                  }}
                >
                  <span
                    className='min-w-0 flex-1 truncate'
                    style={depth ? { paddingLeft: `${depth}rem` } : undefined}
                  >
                    {referenceLabel(reference.collection, row)}
                  </span>
                  {classified && classifierOf(row) ? (
                    <span className='shrink-0 text-xs text-muted-foreground'>
                      {classifierOf(row)}
                    </span>
                  ) : null}
                  {reference.collection === 'categories' && row.appliesTo ? (
                    // A category's device type, so the right kind is obvious
                    // before picking.
                    <span className='shrink-0 text-xs text-muted-foreground'>
                      <AssetTypeBadge value={row.appliesTo} />
                    </span>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
            {reference.filterHint ? (
              <p className='border-t border-border px-3 py-2 text-xs text-muted-foreground'>
                {t(reference.filterHint)}
              </p>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
