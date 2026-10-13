import {
  type ColumnDef,
  type SortingState,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useState, type ReactElement, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table.js';

export interface SortableColumn<T> {
  readonly id: string;
  readonly title: ReactNode;
  // What the column sorts by: a number, a text, or undefined for a blank,
  // which always sorts last.
  readonly sortValue: (row: T) => number | string | undefined;
  readonly cell: (row: T) => ReactNode;
  readonly className?: string;
}

const ariaSort = (
  direction: 'asc' | 'desc' | false,
): 'ascending' | 'descending' | 'none' =>
  direction === 'asc'
    ? 'ascending'
    : direction === 'desc'
      ? 'descending'
      : 'none';

// A column header that sorts its table when clicked, showing the direction
// it sorts in; shared by the workspace's tables and the list pages. Quiet,
// as a header should be: small muted words, the sorted column's in the
// foreground with its arrow, the others' arrow only under the pointer.
export function SortableHead({
  title,
  direction,
  onClick,
  className,
}: {
  title: ReactNode;
  direction: 'asc' | 'desc' | false;
  onClick: () => void;
  className?: string;
}): ReactElement {
  const Icon =
    direction === 'asc'
      ? ArrowUp
      : direction === 'desc'
        ? ArrowDown
        : ChevronsUpDown;
  return (
    <TableHead className={className} aria-sort={ariaSort(direction)}>
      <button
        type='button'
        onClick={onClick}
        className={`group/sort -ml-1 inline-flex h-5 items-center gap-1 rounded-md px-1 transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none ${
          direction ? 'text-foreground' : ''
        }`}
      >
        {title}
        <Icon
          className={`size-3 shrink-0 ${
            direction ? '' : 'opacity-0 group-hover/sort:opacity-60'
          }`}
          aria-hidden
        />
      </button>
    </TableHead>
  );
}

// A small table whose headers sort it, for the workspace's summaries: a click
// on a header sorts by that column at once (TanStack Table's sorting), a
// second click reverses it, a third restores the original order. A number
// column starts from the largest, a text column from A.
export function SortableTable<T>({
  rows,
  columns,
  rowKey,
}: {
  rows: readonly T[];
  columns: readonly SortableColumn<T>[];
  rowKey: (row: T) => string;
}): ReactElement {
  const [sorting, setSorting] = useState<SortingState>([]);
  const definitions: ColumnDef<T, number | string | undefined>[] = columns.map(
    (column) => ({
      id: column.id,
      accessorFn: (row: T) => column.sortValue(row),
      sortUndefined: 'last',
      sortingFn: (a, b, id) => {
        const x = a.getValue<number | string | undefined>(id);
        const y = b.getValue<number | string | undefined>(id);
        return typeof x === 'number' && typeof y === 'number'
          ? x - y
          : String(x).localeCompare(String(y));
      },
    }),
  );
  // TanStack Table hands back one mutable instance that the React Compiler
  // cannot memoize, so it skips compiling this component; the table is still
  // correct without it.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows as T[],
    columns: definitions,
    state: { sorting },
    onSortingChange: setSorting,
    getRowId: (row) => rowKey(row),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((group) => (
          <TableRow key={group.id}>
            {group.headers.map((header, index) => {
              // Rendered here rather than through flexRender: the column
              // definitions are rebuilt on each render, and a header given as
              // a function would be a new component each time, so React would
              // replace the button a click had just focused.
              const direction = header.column.getIsSorted();
              return (
                <SortableHead
                  key={header.id}
                  title={columns[index]?.title}
                  direction={direction}
                  onClick={() => header.column.toggleSorting()}
                />
              );
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow key={row.id}>
            {row.getVisibleCells().map((cell, index) => (
              <TableCell
                key={cell.id}
                className={columns[index]?.className ?? 'tabular-nums'}
              >
                {columns[index]?.cell(row.original)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
