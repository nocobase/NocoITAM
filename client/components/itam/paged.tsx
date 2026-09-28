import type { ReactElement, ReactNode } from 'react';

import { Pagination } from '@/components/itam/pagination';
import { usePagedRows } from '@/lib/itam/paging';

/**
 * Pages an already loaded list in place: the children render one page of
 * the rows and the control appears underneath once there is more than one
 * page. For lists that are not a `DataTable` (a `<ul>` of seats, a report
 * section, a kanban column).
 */
export function Paged<T>({
  rows,
  pageSize,
  children,
}: {
  readonly rows: readonly T[];
  readonly pageSize?: number;
  readonly children: (rows: readonly T[]) => ReactNode;
}): ReactElement {
  const paged = usePagedRows(rows, pageSize);
  return (
    <div className='space-y-2'>
      {children(paged.rows)}
      {paged.pagination ? <Pagination {...paged.pagination} /> : null}
    </div>
  );
}
