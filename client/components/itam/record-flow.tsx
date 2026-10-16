import { useTranslation } from '@nocobase/i18n/client';
import { TriangleAlert } from 'lucide-react';
import type { ReactElement } from 'react';

import { LifecycleDiagram } from '#components/lifecycle-diagram';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useLifecycleDescription,
  useRecordLifecycle,
} from '@/lib/itam/lifecycle';

/**
 * A record's 流程 tab (2026-10-18, docs/adr/0001-record-lifecycles.md): its
 * lifecycle drawn from source with the UI Library's diagram — where it is,
 * the moves it made, the ones the reader may make next — and a line when a
 * notification a move owed could not be delivered after its retries.
 * The diagram only shows: the actions stay the page's own buttons.
 */
export function RecordFlow({
  path,
  id,
  stateLabel,
  transitionLabel,
}: {
  /** The record's API path, such as `itam/disposals`. */
  readonly path: string;
  readonly id: string;
  readonly stateLabel: (state: string) => string;
  readonly transitionLabel: (transition: string) => string;
}): ReactElement {
  const { t } = useTranslation();
  const description = useLifecycleDescription(path);
  const view = useRecordLifecycle(path, id);
  if (!description.data || !view.data)
    return <Skeleton className='h-96 w-full rounded-lg' />;
  const undelivered = view.data.effects.filter((run) =>
    ['failed', 'dead'].includes(run.status),
  ).length;
  return (
    <div className='space-y-3'>
      {undelivered > 0 ? (
        <p className='flex items-center gap-2 text-sm text-destructive'>
          <TriangleAlert className='size-4 shrink-0' aria-hidden='true' />
          {t('lifecycle.undelivered', { count: undelivered })}
        </p>
      ) : null}
      <LifecycleDiagram
        ariaLabel={t('lifecycle.diagram')}
        description={description.data}
        currentState={view.data.state}
        availableTransitions={view.data.available
          .filter((transition) => transition.allowed)
          .map((transition) => transition.name)}
        history={view.data.history}
        stateLabel={(state) => stateLabel(state.name)}
        transitionLabel={(transition) => transitionLabel(transition.name)}
        endLabel={t('lifecycle.end')}
        direction='DOWN'
        autoHeight
      />
    </div>
  );
}
