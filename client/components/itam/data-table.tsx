import { resolveListState } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { Fragment, type ReactElement, type ReactNode } from 'react';

import { ListFeedback, ListFeedbackActions } from '#components/list-feedback';

import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

import { CellText } from './cell-text.js';
import { EmptyState } from './empty-state.js';
import { Pagination, type PaginationProps } from './pagination.js';

export interface DataTableColumn<T> {
  readonly key: string;
  readonly header: ReactNode;
  readonly render: (row: T) => ReactNode;
  readonly sortable?: boolean;
  readonly className?: string;
  /** For the body's cells alone, not the header's — `align-top`, say. */
  readonly cellClassName?: string;
  /**
   * For the cell's content box (`CellText`), whose 20rem cut suits a free
   * value but clips a cell made of a name and its tags (2026-10-22).
   */
  readonly contentClassName?: string;
  readonly width?: string;
}

export interface DataTableProps<T extends { readonly id: string }> {
  readonly columns: readonly DataTableColumn<T>[];
  readonly rows: readonly T[] | undefined;
  readonly loading?: boolean;
  readonly error?: unknown;
  readonly empty?: ReactNode;
  readonly sort?: { readonly field: string; readonly order: 'asc' | 'desc' };
  readonly onSortChange?: (field: string) => void;
  readonly onRowClick?: (row: T) => void;
  readonly pagination?: PaginationProps;
  readonly rowActions?: (row: T) => ReactNode;
  /**
   * A band under a row, spanning every column, for what belongs to that row
   * rather than beside it — the components installed in a device, say. It
   * crosses the columns because none of them is about it: the status and
   * the owner on the row above are the device's.
   */
  readonly subRow?: (row: T) => ReactNode;
  /**
   * What tells two rows apart, where `id` alone does not — a table mixing
   * kinds of record whose ids may meet. Defaults to `id`. Give a key here
   * rather than rewriting `id`: the row is handed back to `onRowClick` and
   * to a column's actions, and an action that sends `id` must send the
   * record's own.
   */
  readonly rowKey?: (row: T) => string;
  /**
   * Whether the reader narrowed the list (a search, a filter), which makes
   * an empty answer "no results" rather than "nothing yet".
   */
  readonly filtered?: boolean;
  /** Offered as 清除筛选 when a narrowed list finds nothing. */
  readonly onClearFilters?: () => void;
  /** Offered as 重试 when the list could not be read. */
  readonly onRetry?: () => void;
}

/** Server-paged table with sorting and the three data states. */
export function DataTable<T extends { readonly id: string }>({
  columns,
  rows,
  loading,
  error,
  empty,
  sort,
  onSortChange,
  onRowClick,
  pagination,
  rowActions,
  subRow,
  rowKey = (row) => row.id,
  filtered = false,
  onClearFilters,
  onRetry,
}: DataTableProps<T>): ReactElement {
  const { t } = useTranslation();
  // The template's list feedback (2026-10-30, template 1.0.0-beta.86): what
  // the list is in — empty, no results, denied, signed out, failed, or rows
  // kept from a refresh that failed — said the same way as the settings
  // pages, with the step that helps. A first read keeps the skeleton rows.
  const state = resolveListState(
    { data: rows, error, isPending: loading && !rows },
    rows?.length ?? 0,
    filtered,
  );
  // An empty result shows only the hint, never a bare table header: the
  // same reading everywhere, in tabs and on list pages.
  if (state === 'empty')
    return <>{empty ?? <EmptyState title={t('common.empty')} />}</>;
  if (state !== 'ready' && state !== 'loading' && state !== 'refresh-failed')
    return (
      <div className='flex flex-col items-center rounded-lg border border-dashed border-border pb-4'>
        <ListFeedback state={state} />
        <ListFeedbackActions
          state={state}
          onClear={onClearFilters}
          onRetry={onRetry}
          busy={loading}
        />
      </div>
    );

  const table = (
    <div className='space-y-3'>
      <div className='overflow-x-auto rounded-lg border border-border bg-card'>
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => {
                const active = sort?.field === column.key;
                return (
                  <TableHead
                    key={column.key}
                    className={column.className}
                    style={{ width: column.width }}
                  >
                    {column.sortable && onSortChange ? (
                      <button
                        type='button'
                        className='inline-flex items-center gap-1 hover:text-foreground'
                        onClick={() => onSortChange(column.key)}
                      >
                        {column.header}
                        {active ? (
                          sort?.order === 'asc' ? (
                            <ArrowUp className='size-3.5' />
                          ) : (
                            <ArrowDown className='size-3.5' />
                          )
                        ) : (
                          <ArrowUpDown className='size-3.5 opacity-40' />
                        )}
                      </button>
                    ) : (
                      column.header
                    )}
                  </TableHead>
                );
              })}
              {rowActions ? <TableHead className='w-12' /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && !rows
              ? ['a', 'b', 'c', 'd', 'e'].map((placeholder) => (
                  <TableRow key={placeholder}>
                    {columns.map((column) => (
                      <TableCell key={column.key}>
                        <Skeleton className='h-4 w-2/3' />
                      </TableCell>
                    ))}
                    {rowActions ? <TableCell /> : null}
                  </TableRow>
                ))
              : null}
            {rows?.map((row) => {
              const band = subRow?.(row);
              return (
                <Fragment key={rowKey(row)}>
                  <TableRow
                    className={cn(
                      onRowClick && 'cursor-pointer',
                      loading && 'opacity-60',
                    )}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {columns.map((column) => (
                      <TableCell
                        key={column.key}
                        className={cn(column.className, column.cellClassName)}
                      >
                        {/* One line per row (2026-10-15), cut short past
                            20rem (`CellText`); the table scrolls sideways
                            when wider than the page. */}
                        <CellText className={column.contentClassName}>
                          {column.render(row)}
                        </CellText>
                      </TableCell>
                    ))}
                    {rowActions ? (
                      <TableCell
                        className='text-right'
                        onClick={(event) => event.stopPropagation()}
                      >
                        {rowActions(row)}
                      </TableCell>
                    ) : null}
                  </TableRow>
                  {band ? (
                    <TableRow className='hover:bg-transparent'>
                      <TableCell
                        colSpan={columns.length + (rowActions ? 1 : 0)}
                        // The page's own background, not the muted fill a
                        // neutral tag wears — side by side those two read as
                        // the same grey.
                        className='bg-background py-1.5'
                      >
                        {band}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {pagination ? <Pagination {...pagination} /> : null}
    </div>
  );
  if (state !== 'refresh-failed') return table;
  return (
    <div className='space-y-3'>
      <ListFeedback state={state}>{table}</ListFeedback>
      <ListFeedbackActions state={state} onRetry={onRetry} busy={loading} />
    </div>
  );
}
