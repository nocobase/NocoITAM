import { useTranslation } from '@nocobase/i18n/client';
import { ArrowRight } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { DocumentTypeBadge } from '@/components/itam/document-type-badge';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate } from '@/lib/itam/format';
import { useWorkCards, type WorkCard } from '@/lib/itam/my-work';
import { useOpenRecord } from '@/lib/itam/record-drawer';

/**
 * "My to-dos": the workbench's top strip. One card per kind of thing waiting
 * on the signed-in user, each listing the first few records behind it rather
 * than only a count — a number says something is waiting without saying
 * what. A record opens in the record drawer, so dealing with one does not
 * cost the reader the workbench.
 */
export function MyWork(): ReactElement | null {
  const { t } = useTranslation();
  const cards = useWorkCards();
  // Nothing is waiting on this reader at all (an employee, whose work is
  // their own assets): the strip says nothing rather than showing a heading
  // over a row of empty boxes.
  if (cards.length === 0) return null;
  return (
    <section className='space-y-3'>
      {/* No total beside the heading: each card carries its own number, and
          a sum of unrelated queues is not a thing anybody acts on. */}
      <h2 className='font-heading text-base leading-snug font-medium'>
        {t('workbench.myWork')}
      </h2>
      {/* Three to a row at full width, by the page's own room rather than
          the window's — the assistant panel narrows the page while the
          window stays wide. */}
      <div className='grid gap-3 @2xl:grid-cols-2 @4xl:grid-cols-3'>
        {cards.map((card) => (
          <WorkCardView key={card.key} card={card} />
        ))}
      </div>
    </section>
  );
}

function WorkCardView({ card }: { readonly card: WorkCard }): ReactElement {
  const { t } = useTranslation();
  const openRecord = useOpenRecord();
  return (
    // The same frame as 需要关注 and 发现的模式 below it — a heading with a
    // count, then its rows. The big number this card carried came from the
    // statistics strip it replaced and belonged to neither shape.
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          {card.label}
          <Badge variant='secondary' className='tabular-nums'>
            {card.count}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {card.count === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('workbench.nothingPending')}
          </p>
        ) : (
          <ul className='divide-y divide-border rounded-lg border border-border bg-card text-sm'>
            {card.records.map((record) => (
              <li key={record.url}>
                <button
                  type='button'
                  onClick={() => {
                    openRecord(record.url);
                  }}
                  className='flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted'
                >
                  <span className='flex min-w-0 items-center gap-2'>
                    {record.tag ? (
                      <DocumentTypeBadge
                        kind={record.tag}
                        className='shrink-0'
                      />
                    ) : null}
                    {/* The record's own name reads as a way into it — the
                        application's green, not a status colour. */}
                    <span className='truncate font-medium text-success-foreground'>
                      {record.title}
                    </span>
                  </span>
                  <span className='flex shrink-0 items-center gap-2 text-xs text-muted-foreground tabular-nums'>
                    {/* Where a record stands for several things — a leaver
                        holds a number of them — how many are the reader's
                        own, so the row is read without being opened. */}
                    {record.count === undefined ? null : (
                      <span>
                        {t('workbench.work.mine', { count: record.count })}
                      </span>
                    )}
                    {/* And where the record is the one thing, that it is
                        theirs — the card lists everybody's. */}
                    {record.mine ? <span>{t('workbench.work.yours')}</span> : null}
                    {record.date ? (
                      <span>{formatDate(record.date)}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {card.links.length > 0 ? (
          <div className='mt-2 flex flex-wrap gap-x-4 gap-y-1'>
            {card.links.map((link) => (
              <Link
                key={link.url}
                to={link.url}
                className='flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground'
              >
                {link.label}
                <ArrowRight aria-hidden='true' className='size-3' />
              </Link>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
