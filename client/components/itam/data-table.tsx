import { useTranslation } from '@nocobase/i18n/client';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { Fragment, type ReactElement, type ReactNode } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { errorMessage } from '@/lib/itam/format';
import { cn } from '@/lib/utils';

import { EmptyState } from './empty-state.js';
import { Pagination, type PaginationProps } from './pagination.js';

export interface DataTableColumn<T> {
  readonly key: string;
  readonly header: ReactNode;
  readonly render: (row: T) => ReactNode;
  readonly sortable?: boolean;
  readonly className?: string;
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
}: DataTableProps<T>): ReactElement {
  const { t } = useTranslation();
  if (error) {
    return (
      <EmptyState
        title={t('common.loadFailed')}
        description={errorMessage(error)}
      />
    );
  }

  // An empty result shows only the hint, never a bare table header: the
  // same reading everywhere, in tabs and on list pages.
  if (rows && rows.length === 0 && !loading) {
    return <>{empty ?? <EmptyState title={t('common.empty')} />}</>;
  }

  return (
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
                        // Long text wraps inside a bounded column instead of
                        // stretching the table sideways.
                        className={cn(
                          'max-w-80 whitespace-normal break-words',
                          column.className,
                        )}
                      >
                        {column.render(row)}
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
}
