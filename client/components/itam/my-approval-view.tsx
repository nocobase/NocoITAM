import { useTranslation } from '@nocobase/i18n/client';
import { useQuery } from '@tanstack/react-query';
import type { ComponentType, ReactElement } from 'react';

import { CountPill } from '@/components/itam/count-pill';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApi } from '@/lib/itam/api';
import { useCollectionPermissions } from '@/lib/itam/permissions';

export interface ViewsProps {
  readonly filter: Readonly<Record<string, string | undefined>>;
  readonly onFilter: (
    filter: Readonly<Record<string, string | undefined>>,
  ) => void;
}

/**
 * A switch between every request and those waiting on this reader's
 * decision, with how many there are: the segmented control 设置 uses for its
 * tabs (2026-10-20), where a lone outlined button beside the title read as
 * a tag. Which ones those are lives in the approval rather than the
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
      <Tabs
        value={active ? 'mine' : 'all'}
        onValueChange={(value) =>
          onFilter({ view: value === 'mine' ? 'myApproval' : undefined })
        }
      >
        <TabsList>
          <TabsTrigger value='all'>{t('common.all')}</TabsTrigger>
          <TabsTrigger value='mine'>
            {t(label)}
            <CountPill>{mine.data ?? 0}</CountPill>
          </TabsTrigger>
        </TabsList>
      </Tabs>
    );
  };
}
