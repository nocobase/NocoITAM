// A scheduled task's drawer (/settings/scheduled-tasks/:scheduleId): its
// particulars and its run history, newest first, paged by the token the
// API returns. The history is a compact list rather than a table, so the
// drawer keeps its medium width (guidelines T2.1, I1).
import { useApiClient } from '@nocobase/app-client';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { HistoryIcon, RefreshCwIcon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { useParams } from 'react-router';

import { RouteDrawer } from '#components/route-drawer';
import { ToneBadge as Badge } from '@/components/settings/tone-badge';
import { Button } from '#components/ui/button';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';
import { Skeleton } from '#components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#components/ui/tooltip';

import { AutoLoadMore } from '../../../components/settings/auto-load.js';
import { LoadFailure } from '../common/shared.js';
import { useAdminText, useDateTime } from '../common/hooks.js';
import { ScheduleSwitch } from './index.js';
import { ScheduleStatusBadge } from './status.js';
import {
  useSchedulesKey,
  type Occurrence,
  type OccurrenceStatus,
  type Schedule,
} from './types.js';

const HISTORY_PAGE = 20;

const OCCURRENCE_TONE: Record<
  OccurrenceStatus,
  'success' | 'warning' | 'muted' | 'info' | 'destructive'
> = {
  succeeded: 'success',
  failed: 'destructive',
  timed_out: 'destructive',
  cancelled: 'muted',
  skipped: 'muted',
  pending: 'info',
  running: 'info',
  waiting: 'info',
  triggered: 'info',
};

export default function ScheduledTaskDrawer(): ReactElement {
  const { text } = useAdminText();
  const { scheduleId = '' } = useParams();
  const api = useApiClient();
  const schedulesKey = useSchedulesKey();
  const schedule = useQuery({
    queryKey: [...schedulesKey, scheduleId],
    queryFn: () =>
      api
        .request<{ data: Schedule }>({
          path: `scheduler/schedules/${encodeURIComponent(scheduleId)}`,
        })
        .then((result) => result.data),
    retry: false,
  });
  return (
    <RouteDrawer
      title={schedule.data?.title ?? text('schedules.title')}
      description={schedule.data?.description}
    >
      {schedule.error && !schedule.data ? (
        <LoadFailure
          error={schedule.error}
          what={text('schedules.whatOne')}
          onRetry={() => void schedule.refetch()}
        />
      ) : !schedule.data ? (
        <DetailsSkeleton />
      ) : (
        <div className='flex flex-col gap-6'>
          <Details schedule={schedule.data} />
          <RunHistory scheduleId={scheduleId} />
        </div>
      )}
    </RouteDrawer>
  );
}

function Details({ schedule }: { readonly schedule: Schedule }): ReactElement {
  const { text, language } = useAdminText();
  const formatDate = useDateTime();
  const row = (label: string, value: ReactNode): ReactElement => (
    <>
      <dt className='text-muted-foreground'>{label}</dt>
      <dd className='min-w-0 break-words'>{value}</dd>
    </>
  );
  return (
    <dl className='grid grid-cols-[8rem_1fr] gap-x-4 gap-y-2.5 text-sm'>
      {row(
        text('schedules.columns.on'),
        <ScheduleSwitch schedule={schedule} />,
      )}
      {row(
        text('schedules.fields.status'),
        <ScheduleStatusBadge schedule={schedule} />,
      )}
      {row(
        text('schedules.fields.key'),
        <code className='font-mono text-xs'>{schedule.key}</code>,
      )}
      {row(
        text('schedules.fields.schedule'),
        <code className='font-mono text-xs'>{schedule.cron}</code>,
      )}
      {row(text('schedules.fields.timezone'), schedule.timezone)}
      {row(
        text('schedules.fields.target'),
        <>
          {schedule.targetSummary.targetLabel}
          {schedule.targetSummary.description ? (
            <span className='block text-muted-foreground'>
              {schedule.targetSummary.description}
            </span>
          ) : null}
        </>,
      )}
      {row(
        text('schedules.fields.runs'),
        schedule.runCount.toLocaleString(language),
      )}
      {row(
        text('schedules.fields.succeeded'),
        schedule.completedCount.toLocaleString(language),
      )}
      {row(text('schedules.fields.lastRun'), formatDate(schedule.lastRunAt))}
      {row(text('schedules.fields.nextRun'), formatDate(schedule.nextRunAt))}
    </dl>
  );
}

function RunHistory({
  scheduleId,
}: {
  readonly scheduleId: string;
}): ReactElement {
  const { text } = useAdminText();
  const api = useApiClient();
  const queryClient = useQueryClient();
  const schedulesKey = useSchedulesKey();
  const formatDate = useDateTime();
  const history = useInfiniteQuery({
    queryKey: [...schedulesKey, scheduleId, 'occurrences'],
    queryFn: ({ pageParam }) =>
      api.request<{
        data: Occurrence[];
        meta: { nextPageToken?: string };
      }>({
        path: `scheduler/schedules/${encodeURIComponent(scheduleId)}/occurrences`,
        query: { pageSize: HISTORY_PAGE, pageToken: pageParam || undefined },
      }),
    initialPageParam: '',
    getNextPageParam: (last) => last.meta.nextPageToken || undefined,
    retry: false,
  });
  const runs = history.data?.pages.flatMap((page) => page.data) ?? [];
  const refreshing = history.isFetching && !history.isFetchingNextPage;

  let body: ReactElement;
  if (history.error && !history.data) {
    body = (
      <LoadFailure
        error={history.error}
        what={text('schedules.history')}
        onRetry={() => void history.refetch()}
      />
    );
  } else if (!history.data) {
    body = (
      <div
        role='status'
        aria-label={text('common.loading')}
        className='flex flex-col gap-2'
      >
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className='h-10 w-full' />
        ))}
      </div>
    );
  } else if (runs.length === 0) {
    body = (
      <Empty className='min-h-40 border border-dashed p-6 md:p-6'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <HistoryIcon />
          </EmptyMedia>
          <EmptyTitle>{text('schedules.historyEmpty')}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  } else {
    body = (
      <>
        <ul className='divide-y rounded-lg border border-border'>
          {runs.map((run) => (
            <li key={run.id} className='flex flex-col gap-1 px-3 py-2 text-sm'>
              <div className='flex flex-wrap items-center gap-x-3 gap-y-1'>
                <Badge variant={OCCURRENCE_TONE[run.status]}>
                  {text(`schedules.occurrence.${run.status}`)}
                </Badge>
                <span className='tabular-nums'>
                  {text('schedules.started')} {formatDate(run.startedAt)}
                </span>
                {run.finishedAt ? (
                  <span className='text-muted-foreground tabular-nums'>
                    {text('schedules.finished')} {formatDate(run.finishedAt)}
                  </span>
                ) : null}
              </div>
              {run.reason ? (
                <p className='break-words text-muted-foreground'>
                  {text('schedules.reason')}: {run.reason}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
        {history.error && history.data ? (
          <LoadFailure
            error={history.error}
            what={text('schedules.history')}
            onRetry={() => void history.fetchNextPage()}
          />
        ) : (
          <AutoLoadMore
            hasMore={history.hasNextPage}
            loading={history.isFetchingNextPage}
            onLoad={() => void history.fetchNextPage()}
          />
        )}
      </>
    );
  }

  return (
    <section className='flex flex-col gap-3'>
      <div className='flex items-center justify-between gap-2'>
        <h2 className='text-base font-medium'>{text('schedules.history')}</h2>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant='outline'
                size='icon-sm'
                aria-label={text('common.refresh')}
                disabled={refreshing}
                onClick={() =>
                  void queryClient.invalidateQueries({
                    queryKey: [...schedulesKey, scheduleId],
                  })
                }
              />
            }
          >
            <RefreshCwIcon className={refreshing ? 'animate-spin' : ''} />
          </TooltipTrigger>
          <TooltipContent>{text('common.refresh')}</TooltipContent>
        </Tooltip>
      </div>
      {body}
    </section>
  );
}

function DetailsSkeleton(): ReactElement {
  const { text } = useAdminText();
  return (
    <div
      role='status'
      aria-label={text('common.loading')}
      className='grid grid-cols-[8rem_1fr] gap-x-4 gap-y-3'
    >
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className='contents'>
          <Skeleton className='h-4 w-20' />
          <Skeleton className='h-4 w-40' />
        </div>
      ))}
    </div>
  );
}
