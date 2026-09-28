import { useTranslation } from '@nocobase/i18n/client';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface PaginationProps {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly onPageChange: (page: number) => void;
  readonly onPageSizeChange?: (pageSize: number) => void;
  readonly pageSizes?: readonly number[];
}

const DEFAULT_SIZES = [20, 50, 100] as const;

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizes = DEFAULT_SIZES,
}: PaginationProps): ReactElement {
  const { t } = useTranslation();
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const items = pageSizes.map((size) => ({
    value: String(size),
    label: String(size),
  }));
  return (
    <div className='flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground'>
      <div>{t('pagination.range', { from, to, total })}</div>
      <div className='flex items-center gap-2'>
        {onPageSizeChange ? (
          <Select
            items={items}
            value={String(pageSize)}
            onValueChange={(value) => onPageSizeChange(Number(value))}
          >
            <SelectTrigger size='sm' aria-label={t('pagination.pageSize')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {t('pagination.perPage', { count: Number(item.value) })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <span className='tabular-nums'>
          {t('pagination.page', { page, pageCount })}
        </span>
        <Button
          variant='outline'
          size='icon-sm'
          aria-label={t('pagination.previous')}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft />
        </Button>
        <Button
          variant='outline'
          size='icon-sm'
          aria-label={t('pagination.next')}
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
