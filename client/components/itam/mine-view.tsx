import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export interface ViewsProps {
  readonly filter: Readonly<Record<string, string | undefined>>;
  readonly onFilter: (
    filter: Readonly<Record<string, string | undefined>>,
  ) => void;
}

/**
 * 全部 | 我的 beside the title of a request that is approved (2026-10-20):
 * 我的 is what waits on this reader's decision and what they are 负责人 of,
 * which the list route answers as `filter[view]=mine`
 * (`server/routes/itam/mine-view.ts`); the rows waiting on them say so
 * themselves (`AwaitingMeTag`). The workbench's links to 待我审批 alone
 * (`view=myApproval`) open under 我的 too.
 */
export function MineView({ filter, onFilter }: ViewsProps): ReactElement {
  const { t } = useTranslation();
  const mine = filter.view === 'mine' || filter.view === 'myApproval';
  return (
    <Tabs
      value={mine ? 'mine' : 'all'}
      onValueChange={(value) =>
        onFilter({ view: value === 'mine' ? 'mine' : undefined })
      }
    >
      <TabsList>
        <TabsTrigger value='all'>{t('common.all')}</TabsTrigger>
        <TabsTrigger value='mine'>{t('common.mine')}</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
