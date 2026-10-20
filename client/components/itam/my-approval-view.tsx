import { useTranslation } from '@nocobase/i18n/client';
import { useQuery } from '@tanstack/react-query';
import { Inbox } from 'lucide-react';
import type { ComponentType, ReactElement } from 'react';

import { CountPill } from '@/components/itam/count-pill';
import { Button } from '@/components/ui/button';
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
 * there are. Which ones those are lives in the approval rather than the
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
    return (
      <div className='flex items-center gap-2'>
        <Button
          size='sm'
          variant={active ? 'secondary' : 'outline'}
          aria-pressed={active}
          onClick={() => onFilter({ view: active ? undefined : 'myApproval' })}
        >
          <Inbox data-icon='inline-start' />
          {t(label)}
          {/* The application's one count look (2026-10-20): a solid badge
              read as a second button inside the first. */}
          <CountPill>{mine.data ?? 0}</CountPill>
        </Button>
      </div>
    );
  };
}
