import { useTranslation } from '@nocobase/i18n/client';
import { ArrowLeft } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router';

import { LeaverRecovery } from '@/components/itam/leaver-recovery';
import { Page } from '@/components/itam/page-header';
import { RecordPane } from '@/components/itam/record-drawer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/itam/format';
import { useWorkCards, type CardRecord } from '@/lib/itam/my-work';

/**
 * 待我处理: the work waiting on this reader, as a queue beside the thing
 * being worked on.
 *
 * The workbench answers "is anything waiting" the moment somebody signs in,
 * with the same to-dos as a strip of counts. This page is where they are
 * settled, so it is laid out for working through: every waiting record in one
 * list on the left, under the to-do it belongs to, and the one picked open on
 * the right — the record's own page, with its own actions, rather than a
 * second rendering of it. Choosing one does not leave the page, so the next
 * is one click away.
 *
 * Narrow, the two halves come one at a time: the list, then the record opened
 * from it, with 返回 back to the list.
 */
export default function InboxPage(): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // A queue with nothing in it is left out: the strip shows every to-do
  // with 暂无待办 under it, because a card that disappears at zero cannot be
  // told from one the reader does not have — but here a heading with no rows
  // under it is just a line to scroll past on the way to the work.
  const cards = useWorkCards().filter((card) => card.records.length > 0);
  const rows = cards.flatMap((card) =>
    card.records.map((record) => ({ card, record })),
  );
  const [chosen, setChosen] = useState<string>();
  // Beside the list the first stands open before anything is picked; narrow,
  // nothing is open until one is.
  const [reading, setReading] = useState(false);
  const current = rows.find((row) => row.record.url === chosen) ?? rows[0];
  const total = cards.reduce((sum, card) => sum + card.count, 0);

  return (
    <Page>
      <section className='@container space-y-3'>
        <h2 className='font-heading text-base leading-snug font-medium'>
          {t('workbench.myWork')}
          {total > 0 ? (
            <span className='ml-2 text-base font-normal text-muted-foreground tabular-nums'>
              {total}
            </span>
          ) : null}
        </h2>
        {!current ? (
          <p className='rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground'>
            {t('workbench.nothingPending')}
          </p>
        ) : (
          // Side by side the list and the item share one card; narrow, each
          // stands on the page on its own.
          <div className='grid @3xl:grid-cols-[22rem_minmax(0,1fr)] @3xl:overflow-hidden @3xl:rounded-xl @3xl:border @3xl:border-border @3xl:bg-card'>
            <ul
              className={`@3xl:block @3xl:overflow-y-auto @3xl:border-r @3xl:border-border ${
                reading ? 'hidden' : ''
              }`}
            >
              {cards.map((card) => (
                <li key={card.key}>
                  {/* The to-do the rows below belong to. The count is the
                      whole queue's; the rows are its first few. */}
                  <p className='border-b border-border bg-muted/40 px-4 py-1.5 text-xs font-medium text-muted-foreground'>
                    {card.label}
                    <span className='ml-2 tabular-nums'>{card.count}</span>
                  </p>
                  <ul>
                    {card.records.map((record) => (
                      <li
                        key={record.url}
                        className='border-b border-border last:border-b-0'
                      >
                        <WorkRow
                          record={record}
                          chosen={record.url === current.record.url}
                          onChoose={() => {
                            setChosen(record.url);
                            setReading(
                              !window.matchMedia('(min-width: 48rem)').matches,
                            );
                          }}
                        />
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
            <div className={`min-w-0 ${reading ? '' : 'hidden @3xl:block'}`}>
              {reading ? (
                <div className='flex h-12 items-center px-3 @3xl:hidden'>
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={() => setReading(false)}
                  >
                    <ArrowLeft data-icon='inline-start' />
                    {t('common.back')}
                  </Button>
                </div>
              ) : null}
              {/* A leaver's recovery is the one to-do whose answer is not a
                  record page: it is one person's whole handover, which the
                  card lists with the action each item needs. Everything else
                  is settled on its own record, so that page is what opens. */}
              {current.card.key === 'leaverRecovery' ? (
                <div className='p-4'>
                  <LeaverRecovery
                    key={current.record.id}
                    personId={current.record.id}
                    personName={current.record.title}
                  />
                </div>
              ) : (
                <RecordPane
                  key={current.record.url}
                  to={current.record.url}
                  onLeave={(path) => void navigate(path)}
                />
              )}
            </div>
          </div>
        )}
      </section>
    </Page>
  );
}

function WorkRow({
  record,
  chosen,
  onChoose,
}: {
  readonly record: CardRecord;
  readonly chosen: boolean;
  readonly onChoose: () => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <button
      type='button'
      aria-current={chosen}
      onClick={onChoose}
      className={`flex w-full flex-col gap-0.5 px-4 py-3 text-left text-sm transition-colors hover:bg-muted/50 ${
        chosen ? 'bg-muted shadow-[inset_2px_0_0_var(--primary)]' : ''
      }`}
    >
      <span className='flex min-w-0 items-center gap-2'>
        {record.tag ? (
          <Badge variant='outline' className='shrink-0'>
            {record.tag}
          </Badge>
        ) : null}
        <span className='truncate font-medium'>{record.title}</span>
      </span>
      <span className='flex items-center gap-2 text-xs text-muted-foreground tabular-nums'>
        {/* Where a record stands for several things — a leaver holds a
            number of them — how many are the reader's own. */}
        {record.count === undefined ? null : (
          <span>{t('workbench.work.mine', { count: record.count })}</span>
        )}
        {record.date ? <span>{formatDate(record.date)}</span> : null}
      </span>
    </button>
  );
}
