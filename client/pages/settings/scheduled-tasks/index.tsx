// Settings → Scheduled tasks: the scheduler plugin's schedules (ITAM's
// nightly employment, maintenance and depreciation runs), each switched on or off at
// once, with a drawer of its run history. The plugin's API checks the page
// grant `scheduler.schedules` this route declares, so granting the page on
// the Permission sets page grants the API too.
import { useApiClient, useToaster } from '@nocobase/app-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClockIcon, RefreshCwIcon } from 'lucide-react';
import { useMemo, useState, type ReactElement } from 'react';
import { Link, Outlet, useLocation } from 'react-router';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Button } from '#components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';
import { Switch } from '#components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#components/ui/tooltip';

import { SortableHead } from '../../../components/settings/sortable-table.js';
import { LoadFailure, TableSkeleton, TruncatedText } from '../common/shared.js';
import { useAdminText, useDateTime, useFailureText } from '../common/hooks.js';
import {
  useSchedulesKey,
  scheduleState,
  type Schedule,
  type SchedulesOutletContext,
} from './types.js';
import { ScheduleStatusBadge } from './status.js';

// The schedules are the application's passes, a handful: the page asks for
// the largest page the API gives and sorts in the browser, saying so when
// more exist (guideline T1.10).
const PAGE_SIZE = 100;

type SortColumn = 'title' | 'lastRun' | 'nextRun' | 'runs';

export default function ScheduledTasksPage(): ReactElement {
  const { text, language } = useAdminText();
  const api = useApiClient();
  const queryClient = useQueryClient();
  const schedulesKey = useSchedulesKey();
  const location = useLocation();
  const formatDate = useDateTime();

  const query = useQuery({
    queryKey: schedulesKey,
    queryFn: () =>
      api.request<{
        data: Schedule[];
        meta: { total: number };
      }>({ path: 'scheduler/schedules', query: { pageSize: PAGE_SIZE } }),
    retry: false,
  });

  // Most recently run first by default; a click on a header sorts by it.
  const [sort, setSort] = useState<{
    readonly column: SortColumn;
    readonly direction: 'asc' | 'desc';
  }>({ column: 'lastRun', direction: 'desc' });
  const collator = useMemo(() => new Intl.Collator(language), [language]);

  const rows = useMemo(() => {
    const list = [...(query.data?.data ?? [])];
    const value = (row: Schedule): number | string | undefined =>
      sort.column === 'title'
        ? row.title
        : sort.column === 'runs'
          ? row.runCount
          : sort.column === 'lastRun'
            ? row.lastRunAt && Date.parse(row.lastRunAt)
            : row.nextRunAt && Date.parse(row.nextRunAt);
    list.sort((a, b) => {
      const x = value(a);
      const y = value(b);
      // Blanks last, whichever the direction.
      if (x === undefined || x === '') return 1;
      if (y === undefined || y === '') return -1;
      const order =
        typeof x === 'number' && typeof y === 'number'
          ? x - y
          : collator.compare(String(x), String(y));
      return sort.direction === 'asc' ? order : -order;
    });
    return list;
  }, [query.data, sort, collator]);

  const head = (column: SortColumn, title: string, className?: string) => (
    <SortableHead
      title={title}
      className={className}
      direction={sort.column === column ? sort.direction : false}
      onClick={() =>
        setSort((current) => ({
          column,
          direction:
            current.column === column && current.direction === 'desc'
              ? 'asc'
              : 'desc',
        }))
      }
    />
  );

  const outletContext = useMemo<SchedulesOutletContext>(
    () => ({
      reload: () =>
        void queryClient.invalidateQueries({ queryKey: schedulesKey }),
    }),
    [queryClient, schedulesKey],
  );

  const refreshing = query.isFetching;
  const refresh = (): void => {
    // The list and an open drawer's schedule and history (guideline R4).
    void queryClient.invalidateQueries({ queryKey: schedulesKey });
  };

  let content: ReactElement;
  if (query.error && !query.data) {
    content = (
      <LoadFailure
        error={query.error}
        what={text('schedules.what')}
        onRetry={refresh}
      />
    );
  } else if (!query.data) {
    content = <TableSkeleton columns={6} />;
  } else if (rows.length === 0) {
    content = (
      <Empty className='min-h-48 border border-dashed'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <CalendarClockIcon />
          </EmptyMedia>
          <EmptyTitle>{text('schedules.emptyTitle')}</EmptyTitle>
          <EmptyDescription>{text('schedules.emptyBody')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  } else {
    const capped = query.data.meta.total > rows.length;
    content = (
      <div className='flex flex-col gap-2'>
        {capped ? (
          <p className='text-sm text-muted-foreground'>
            {text('schedules.cap', { count: rows.length })}
          </p>
        ) : null}
        <div className='overflow-x-auto rounded-lg border border-border bg-card shadow-xs'>
          <Table>
            <TableHeader>
              <TableRow>
                {head('title', text('schedules.columns.task'))}
                <TableHead>{text('schedules.columns.schedule')}</TableHead>
                <TableHead>{text('schedules.columns.status')}</TableHead>
                {head('lastRun', text('schedules.columns.lastRun'))}
                {head('nextRun', text('schedules.columns.nextRun'))}
                {head('runs', text('schedules.columns.runs'), 'text-right')}
                <TableHead className='text-right'>
                  {text('schedules.columns.on')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((schedule) => (
                <TableRow key={schedule.id}>
                  <TableCell className='max-w-80'>
                    <Link
                      to={{
                        pathname: encodeURIComponent(schedule.id),
                        search: location.search,
                      }}
                      className='block font-medium underline-offset-4 hover:underline'
                    >
                      <TruncatedText>{schedule.title}</TruncatedText>
                    </Link>
                  </TableCell>
                  <TableCell className='whitespace-nowrap'>
                    <code className='font-mono text-xs'>{schedule.cron}</code>
                    <span className='text-muted-foreground'>
                      {' · '}
                      {schedule.timezone}
                    </span>
                  </TableCell>
                  <TableCell>
                    <ScheduleStatusBadge schedule={schedule} />
                  </TableCell>
                  <TableCell className='whitespace-nowrap text-muted-foreground'>
                    {formatDate(schedule.lastRunAt)}
                  </TableCell>
                  <TableCell className='whitespace-nowrap text-muted-foreground'>
                    {formatDate(schedule.nextRunAt)}
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>
                    {schedule.runCount.toLocaleString(language)}
                  </TableCell>
                  <TableCell className='text-right'>
                    <ScheduleSwitch schedule={schedule} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={text('schedules.title')}
        description={text('schedules.description')}
        actions={
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant='outline'
                  size='icon'
                  aria-label={text('common.refresh')}
                  disabled={refreshing}
                  onClick={refresh}
                />
              }
            >
              <RefreshCwIcon className={refreshing ? 'animate-spin' : ''} />
            </TooltipTrigger>
            <TooltipContent>{text('common.refresh')}</TooltipContent>
          </Tooltip>
        }
      />
      {content}
      <Outlet context={outletContext} />
    </PageContainer>
  );
}

/** A schedule's On switch: applies at once, with a toast, and reverts on failure (guideline T4.3). */
export function ScheduleSwitch({
  schedule,
}: {
  readonly schedule: Schedule;
}): ReactElement {
  const { text } = useAdminText();
  const api = useApiClient();
  const toaster = useToaster();
  const failureText = useFailureText();
  const queryClient = useQueryClient();
  const schedulesKey = useSchedulesKey();
  const [pending, setPending] = useState<boolean>();
  const inactive = scheduleState(schedule) === 'inactive';
  const checked = pending ?? schedule.enabled;
  const control = (
    <Switch
      checked={checked}
      disabled={inactive || pending !== undefined}
      aria-label={text('schedules.switchFor', { title: schedule.title })}
      onCheckedChange={(on) => {
        setPending(on);
        api
          .request<{ data: Schedule }>({
            path: `scheduler/schedules/${encodeURIComponent(schedule.id)}/${on ? 'enable' : 'disable'}`,
            method: 'POST',
          })
          .then(
            async () => {
              toaster.show({
                type: 'success',
                title: text(on ? 'schedules.resumed' : 'schedules.paused', {
                  title: schedule.title,
                }),
              });
              await queryClient.invalidateQueries({ queryKey: schedulesKey });
            },
            (error: unknown) => {
              toaster.show({ type: 'error', title: failureText(error) });
              // A schedule gone or changed meanwhile: show what is there now.
              void queryClient.invalidateQueries({ queryKey: schedulesKey });
            },
          )
          .finally(() => setPending(undefined));
      }}
    />
  );
  if (!inactive) return control;
  return (
    <Tooltip>
      {/* A disabled switch takes no focus; the span does, so the keyboard reaches the reason too. */}
      <TooltipTrigger
        render={
          <span
            tabIndex={0}
            className='inline-flex rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50'
          />
        }
      >
        {control}
      </TooltipTrigger>
      <TooltipContent>{text('schedules.inactiveHint')}</TooltipContent>
    </Tooltip>
  );
}
