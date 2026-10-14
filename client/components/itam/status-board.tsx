import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ComponentType, type ReactElement } from 'react';
import { useNavigate } from 'react-router';

import { BoardCards, type BoardCardSpec } from '@/components/itam/board-cards';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useItamList, type ItamRecord } from '@/lib/itam/api';

/** Cards a column reads at first, and how many each 加载更多 adds. */
const PAGE = 20;

export interface StatusBoardConfig extends BoardCardSpec {
  /** API path of the list, e.g. `itam/purchase-orders`. */
  readonly path: string;
  /** Route segment a card opens, e.g. `procurement`. */
  readonly route: string;
  /** The columns, in the order work moves through them. */
  readonly statuses: readonly string[];
  /**
   * Each status's colour as a dot before its column's name: the colour its
   * tag has everywhere else, without a row of tags in the headings.
   */
  readonly dots?: Readonly<Record<string, string>>;
  readonly statusField?: string;
  readonly defaultSort?: string;
}

type Filter = Readonly<Record<string, string | undefined>>;

/**
 * A board of a domain's records, one column per status in the order work
 * moves through them (a domain's `Board`, the list page's default layout).
 * Each column reads its own page from the server and states the server's
 * total, so a column of hundreds shows the first twenty and says how many
 * there are; 加载更多 reads the next. The search and filters of the list
 * apply to every column. Cards open their record; a status changes through
 * the record's own actions, which ask what each step needs (an approver,
 * the order dates), so cards are not dragged between columns.
 */
export function createStatusBoard(
  config: StatusBoardConfig,
): ComponentType<{ readonly filter: Filter; readonly q: string }> {
  const statusField = config.statusField ?? 'status';
  const fieldOf = (key: string) =>
    config.fields.find((field) => field.key === key);

  function StatusColumn({
    status,
    filter,
    q,
  }: {
    readonly status: string;
    readonly filter: Filter;
    readonly q: string;
  }): ReactElement {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [pageSize, setPageSize] = useState(PAGE);
    const list = useItamList<ItamRecord>(config.path, {
      page: 1,
      pageSize,
      q,
      sort: config.defaultSort,
      order: 'desc',
      filter: { ...filter, [statusField]: status },
    });
    const rows = list.data?.data ?? [];
    const total = list.data?.total ?? 0;
    const statusDefinition = fieldOf(statusField);
    const statusLabel = t(
      statusDefinition?.options?.find((option) => option.value === status)
        ?.label ?? status,
    );
    return (
      <section
        aria-label={statusLabel}
        // A tint of the foreground rather than `bg-muted`: the page itself is
        // grey, and muted is the same grey, so the column vanished. A light
        // one, since a column is mostly empty and a dark slab weighs on the
        // cards it is meant to hold.
        // At least 15rem, sharing what room is left up to 22rem: a board of
        // five statuses on a wide screen fills it instead of stopping short.
        className='flex max-w-[22rem] min-w-[15rem] flex-1 basis-[15rem] flex-col rounded-2xl bg-foreground/[0.025]'
      >
        {/* The heading is the status's name, not its coloured tag: a row of
            differently coloured tags read as noise, and the order of the
            columns already says where each one stands. */}
        <header className='flex h-11 shrink-0 items-center gap-2 px-3.5'>
          {config.dots?.[status] ? (
            <span
              aria-hidden='true'
              className={`size-2 shrink-0 rounded-full ${config.dots[status]}`}
            />
          ) : null}
          <span className='truncate text-sm font-semibold'>{statusLabel}</span>
          {list.data ? (
            <span className='rounded-full bg-background px-1.5 text-xs leading-5 font-medium text-muted-foreground tabular-nums ring-1 ring-border/60'>
              {total}
            </span>
          ) : null}
        </header>
        <div className='flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2'>
          {list.isLoading ? (
            <Skeleton className='h-24 w-full rounded-lg' />
          ) : rows.length === 0 ? (
            <p className='mx-1 rounded-xl border border-dashed border-border py-5 text-center text-xs text-muted-foreground'>
              {t('common.empty')}
            </p>
          ) : (
            <BoardCards
              entries={rows.map((row) => ({ spec: config, row }))}
              onOpen={({ row }) => void navigate(`/${config.route}/${row.id}`)}
            />
          )}
          {rows.length < total ? (
            <Button
              variant='ghost'
              size='sm'
              disabled={list.isFetching}
              onClick={() => setPageSize((current) => current + PAGE)}
            >
              {t('common.loadMore')}
            </Button>
          ) : null}
        </div>
      </section>
    );
  }

  return function StatusBoard({ filter, q }): ReactElement {
    // A status chosen in the filters narrows the board to that column.
    const chosen = filter[statusField];
    const statuses = chosen
      ? config.statuses.filter((status) => status === chosen)
      : config.statuses;
    return (
      // The board takes the rest of the page's height (`Page fill`), so the
      // columns reach the bottom, each scrolls its own cards, and the
      // sideways scrollbar sits at the foot of the page instead of under
      // the shortest column. Below 20rem it stops shrinking and the page
      // scrolls instead.
      <div className='scroll-shown -mx-1 flex min-h-80 flex-1 gap-3 overflow-x-auto px-1 pb-2'>
        {statuses.map((status) => (
          <StatusColumn key={status} status={status} filter={filter} q={q} />
        ))}
      </div>
    );
  };
}
