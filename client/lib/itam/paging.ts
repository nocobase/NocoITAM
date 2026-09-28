import { useState } from 'react';

import type { PaginationProps } from '@/components/itam/pagination';

/**
 * Pages through rows that are already loaded (a person's holdings, an
 * audit's items, the AI action queue): a page of them and, when there is
 * more than one page, the props for the `Pagination` control.
 */
export function usePagedRows<T>(
  rows: readonly T[],
  pageSize = 20,
): { rows: readonly T[]; pagination: PaginationProps | undefined } {
  const [page, setPage] = useState(1);
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pages);
  const start = (current - 1) * pageSize;
  return {
    rows: rows.slice(start, start + pageSize),
    pagination:
      total > pageSize
        ? { page: current, pageSize, total, onPageChange: setPage }
        : undefined,
  };
}

/**
 * Page state for a server-paged list: the page to ask for, and the control's
 * props once the response says how many rows there are.
 */
export function useServerPage(pageSize = 20): {
  page: number;
  pageSize: number;
  pagination: (total: number | undefined) => PaginationProps | undefined;
} {
  const [page, setPage] = useState(1);
  return {
    page,
    pageSize,
    pagination: (total) =>
      (total ?? 0) > pageSize
        ? { page, pageSize, total: total ?? 0, onPageChange: setPage }
        : undefined,
  };
}
