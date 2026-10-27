import { type ReactElement, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { TableHead } from '../ui/table.js';

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
