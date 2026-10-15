import type { ReactElement, ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * A table cell's content on one line (2026-10-15): cut short with an
 * ellipsis past 20rem, or the width `className` gives, and shown whole on
 * hover only when it was cut. A cell never wraps (`TableCell` is
 * `whitespace-nowrap`), so without a limit one long value — a reason, a
 * name — widens the whole table and pushes its last columns, usually the
 * buttons, out of view. What is inside does not wrap either: a tag beside
 * a name or a person's icon stays on the line rather than starting another.
 *
 * `DataTable` puts every cell in one; a table of its own wraps each cell
 * that holds free text. Error messages are the exception: they wrap,
 * because they must be read whole.
 */
export function CellText({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}): ReactElement {
  return (
    <div
      className={cn(
        'max-w-80 truncate [&_*]:flex-nowrap [&_*]:whitespace-nowrap',
        className,
      )}
      onMouseEnter={(event) => {
        const cell = event.currentTarget;
        cell.title =
          cell.scrollWidth > cell.clientWidth ? (cell.textContent ?? '') : '';
      }}
    >
      {children}
    </div>
  );
}
