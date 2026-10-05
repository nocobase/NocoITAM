import { useTranslation } from '@nocobase/i18n/client';
import {
  Fragment,
  useState,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router';

import { FieldValue } from '@/components/itam/cells';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useItamList, useItamSettings, type ItamRecord } from '@/lib/itam/api';
import type { FieldDefinition } from '@/lib/itam/fields';
import { text } from '@/lib/itam/format';
import { useReferenceNames } from '@/lib/itam/references';

/** Cards a column reads at first, and how many each 加载更多 adds. */
const PAGE = 20;

type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * One piece of a card: a field key, shown as its value alone (the card has
 * no labels), or a function for a value made of several fields.
 */
export type CardPart =
  string | ((record: ItamRecord, t: Translate) => ReactNode | null | undefined);

export interface StatusBoardConfig {
  /** API path of the list, e.g. `itam/purchase-orders`. */
  readonly path: string;
  /** Route segment a card opens, e.g. `procurement`. */
  readonly route: string;
  readonly fields: readonly FieldDefinition[];
  /** The field a card is headed by (its number or name). */
  readonly nameField: string;
  /** The columns, in the order work moves through them. */
  readonly statuses: readonly string[];
  /**
   * Each status's colour as a dot before its column's name: the colour its
   * tag has everywhere else, without a row of tags in the headings.
   */
  readonly dots?: Readonly<Record<string, string>>;
  readonly card: {
    /** Beside the heading, right-aligned: an amount, a progress. */
    readonly meta?: CardPart;
    /** Under the heading, one line each: what the record is about. */
    readonly lines?: readonly CardPart[];
    /** Small and muted at the bottom: who and when. */
    readonly footer?: readonly CardPart[];
  };
  readonly statusField?: string;
  readonly defaultSort?: string;
}

type Filter = Readonly<Record<string, string | undefined>>;

const blank = (value: unknown): boolean =>
  value === null || value === undefined || value === '';

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
  const parts = [
    config.card.meta,
    ...(config.card.lines ?? []),
    ...(config.card.footer ?? []),
  ];
  const referenceFields = parts.flatMap((part) => {
    const field = typeof part === 'string' ? fieldOf(part) : undefined;
    return field?.type === 'reference' && field.reference ? [field] : [];
  });

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
    const settings = useItamSettings();
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
    const names = useReferenceNames(
      referenceFields.map((field) => ({
        collection: field.reference!.collection,
        ids: rows.map((row) => row[field.key] as string | null),
      })),
    );
    const render = (part: CardPart, row: ItamRecord): ReactNode => {
      if (typeof part === 'function') return part(row, t);
      const field = fieldOf(part);
      if (!field || blank(row[part])) return null;
      return (
        <FieldValue
          field={field}
          value={row[part]}
          names={names}
          // Plain names: the whole card is the link.
          routeFor={() => ''}
          currency={text(row.currency) || settings.data?.general.currency}
          treeShow='leaf'
          plainEnums
        />
      );
    };
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
            <ul className='flex flex-col gap-2'>
              {rows.map((row) => {
                const meta = config.card.meta && render(config.card.meta, row);
                const lines = (config.card.lines ?? [])
                  .map((part) => render(part, row))
                  .filter((node) => !blank(node));
                const footer = (config.card.footer ?? [])
                  .map((part) => render(part, row))
                  .filter((node) => !blank(node));
                return (
                  <li key={String(row.id)}>
                    <button
                      type='button'
                      className='w-full rounded-xl border border-border/50 bg-card px-3.5 py-3 text-left shadow-xs transition hover:-translate-y-px hover:border-border hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
                      onClick={() =>
                        void navigate(`/${config.route}/${row.id}`)
                      }
                    >
                      <div className='flex items-baseline justify-between gap-2'>
                        <span className='min-w-0 truncate text-sm font-semibold'>
                          {text(row[config.nameField])}
                        </span>
                        {meta ? (
                          <span className='shrink-0 text-sm font-medium tabular-nums'>
                            {meta}
                          </span>
                        ) : null}
                      </div>
                      {lines.length > 0 ? (
                        <div className='mt-1.5 space-y-0.5 text-sm'>
                          {lines.map((line, index) => (
                            <p
                              // Lines are positional: the config's order.
                              // eslint-disable-next-line @eslint-react/no-array-index-key -- see above
                              key={index}
                              className={
                                index === 0
                                  ? 'truncate'
                                  : 'truncate text-muted-foreground'
                              }
                            >
                              {line}
                            </p>
                          ))}
                        </div>
                      ) : null}
                      {footer.length > 0 ? (
                        <p className='mt-2.5 flex min-w-0 items-center gap-1.5 truncate border-t border-border/50 pt-2 text-xs text-muted-foreground'>
                          {footer.map((part, index) => (
                            // eslint-disable-next-line @eslint-react/no-array-index-key -- positional, as above
                            <Fragment key={index}>
                              {index > 0 ? (
                                <span aria-hidden='true'>·</span>
                              ) : null}
                              <span className='truncate'>{part}</span>
                            </Fragment>
                          ))}
                        </p>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
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
      <div className='-mx-1 flex min-h-80 flex-1 gap-3 overflow-x-auto px-1 pb-2'>
        {statuses.map((status) => (
          <StatusColumn key={status} status={status} filter={filter} q={q} />
        ))}
      </div>
    );
  };
}
