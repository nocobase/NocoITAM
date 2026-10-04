import { useTranslation } from '@nocobase/i18n/client';
import { ArrowRight } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatDate } from '@/lib/itam/format';
import { useOpenRecord } from '@/lib/itam/record-drawer';
import {
  MY_WORK_PREVIEW,
  useMyWork,
  type MyWorkItem,
  type MyWorkRecord,
} from '@/lib/itam/workbench';

/**
 * "My to-dos": the workbench's top strip. One card per kind of thing waiting
 * on the signed-in user, each listing the first few records behind it rather
 * than only a count — a number says something is waiting without saying
 * what. A record opens in the record drawer, so dealing with one does not
 * cost the reader the workbench.
 */

/** A record on a card, with the kind tag the merged approval card needs. */
interface CardRecord extends MyWorkRecord {
  readonly tag?: string;
}

interface WorkCard {
  readonly key: string;
  readonly label: string;
  readonly count: number;
  readonly records: readonly CardRecord[];
  /** Where "see all" goes; several when one card merges several to-dos. */
  readonly links: readonly { readonly label: string; readonly url: string }[];
}

export function MyWork(): ReactElement | null {
  const { t } = useTranslation();
  const work = useMyWork();
  const items = work.data ?? [];
  const find = (key: string) => items.find((item) => item.key === key);
  const cards: WorkCard[] = [];

  // 待我审批 is one card for both kinds of request, each record tagged with
  // the kind it is. The two stay separate to-dos underneath, because each
  // has its own count and its own list to land on.
  const purchase = find('pendingPurchaseApprovals');
  const disposal = find('pendingDisposalApprovals');
  if (purchase || disposal) {
    const tagged = (item: MyWorkItem | undefined, tag: string): CardRecord[] =>
      (item?.records ?? []).map((record) => ({ ...record, tag: t(tag) }));
    cards.push({
      key: 'pendingApprovals',
      label: t('workbench.work.pendingApprovals'),
      count: (purchase?.count ?? 0) + (disposal?.count ?? 0),
      // Oldest first across both kinds: what has waited longest comes first.
      records: [
        ...tagged(purchase, 'workbench.work.tagPurchase'),
        ...tagged(disposal, 'workbench.work.tagDisposal'),
      ]
        .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
        .slice(0, MY_WORK_PREVIEW),
      links: [purchase, disposal].flatMap((item) =>
        item && item.count > MY_WORK_PREVIEW
          ? [{ label: t(`workbench.work.${item.key}`), url: item.url }]
          : [],
      ),
    });
  }

  // A record whose title is only a number says nothing about what it is, so
  // it carries a tag; a device (编号 / 名称) and an audit task (its name)
  // name themselves and take none.
  const TAGGED: Readonly<Record<string, string>> = {
    awaitingReceipt: 'workbench.work.tagPurchase',
    activeRepairs: 'workbench.work.tagRepair',
    pendingDisposalExecution: 'workbench.work.tagDisposal',
  };
  for (const key of [
    // First after the approvals: somebody has left with the company's
    // equipment, which was the one `critical` rule while this was a reminder.
    // A person names themselves, so these records take no tag.
    'leaverRecovery',
    'awaitingReceipt',
    'pendingDisposalExecution',
    'activeRepairs',
    'activeAudits',
    'loansDueToday',
  ]) {
    const item = find(key);
    if (!item) continue;
    const tag = TAGGED[key];
    cards.push({
      key,
      label: t(`workbench.work.${key}`),
      count: item.count,
      records: tag
        ? item.records.map((record) => ({ ...record, tag: t(tag) }))
        : item.records,
      links:
        item.count > MY_WORK_PREVIEW
          ? [{ label: t('workbench.seeAll'), url: item.url }]
          : [],
    });
  }

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
                      <Badge variant='outline' className='shrink-0'>
                        {record.tag}
                      </Badge>
                    ) : null}
                    {/* The record's own name reads as a way into it — the
                        application's green, not a status colour. */}
                    <span className='truncate font-medium text-success-foreground'>
                      {record.title}
                    </span>
                  </span>
                  {record.date ? (
                    <span className='shrink-0 text-xs text-muted-foreground tabular-nums'>
                      {formatDate(record.date)}
                    </span>
                  ) : null}
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
