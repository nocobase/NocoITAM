import { useTranslation } from '@nocobase/i18n/client';
import { useQuery } from '@tanstack/react-query';
import { Inbox } from 'lucide-react';
import type { ComponentType, ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useApi } from '@/lib/itam/api';
import { useCollectionPermissions } from '@/lib/itam/permissions';

export interface ViewsProps {
  readonly filter: Readonly<Record<string, string | undefined>>;
  readonly onFilter: (
    filter: Readonly<Record<string, string | undefined>>,
  ) => void;
}

/**
 * A toggle for the requests waiting on this reader's decision, with how many
 * there are. Quiet until it matters (2026-10-20): no outline, which beside
 * the title read as a tag; pressed it is shaded like a selected tab, and a
 * count waiting on the reader is tinted with the primary color. Which ones those are lives in the approval rather than the
 * record, so the list route answers `filter[view]=myApproval`; a reader who
 * cannot approve this kind of request sees no toggle at all.
 */
export function createMyApprovalView(options: {
  readonly collection: string;
  readonly path: string;
  readonly label: string;
}): ComponentType<ViewsProps> {
  const { collection, path, label } = options;
  return function MyApprovalView({ filter, onFilter }): ReactElement | null {
    const { t } = useTranslation();
    const api = useApi();
    const permissions = useCollectionPermissions(collection, ['approve']);
    const mine = useQuery({
      queryKey: ['itam', path, 'myApproval'],
      queryFn: async () =>
        (
          await api.request<{ total: number }>({
            path,
            query: { 'filter[view]': 'myApproval', pageSize: '1' },
          })
        ).total,
      enabled: Boolean(permissions.approve),
    });
    if (!permissions.approve) return null;
    const active = filter.view === 'myApproval';
    const waiting = mine.data ?? 0;
    return (
      <Button
        size='sm'
        variant='ghost'
        aria-pressed={active}
        className={cn(
          'text-muted-foreground',
          active && 'bg-muted font-medium text-foreground',
        )}
        onClick={() => onFilter({ view: active ? undefined : 'myApproval' })}
      >
        <Inbox data-icon='inline-start' />
        {t(label)}
        <span
          className={cn(
            'rounded-full px-1.5 text-xs leading-5 font-medium tabular-nums',
            waiting > 0
              ? 'bg-primary/10 text-primary'
              : 'bg-muted text-muted-foreground',
          )}
        >
          {waiting}
        </span>
      </Button>
    );
  };
}
