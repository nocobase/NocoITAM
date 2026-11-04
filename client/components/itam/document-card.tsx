import type { LucideIcon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import { RecordLink } from './record-link.js';

/** Each kind's icon, tinted as the rest of the application tints it. */
const TONES = {
  // Blue, as the 采购 kind tag is (2026-10-23).
  purchase: 'bg-info text-info-foreground',
  repair: 'bg-warning text-warning-foreground',
  disposal: 'bg-destructive/10 text-destructive',
} as const;
export type DocumentTone = keyof typeof TONES;

/**
 * One document (purchase order, repair, disposal) as a card in a record's
 * related-documents lists. Every kind has the same shape (2026-10-17): its
 * icon in a round badge tinted by kind; the number (a link to the record)
 * and the document's own words — an order's description, a repair's
 * fault — on the first line; its type and the details in small text
 * underneath; and at the right the status over the amount, so the figures
 * line up down the list. Narrower than `@lg` (a phone, 2026-11-04) the icon
 * goes, the list's heading already saying the kind, and each part takes a
 * line of its own under the number and status: beside the icon and the
 * figures the words had a fifth of the card and were cut to "Bo…".
 */
export function DocumentCard({
  icon: Icon,
  tone,
  to,
  number,
  title,
  kind,
  status,
  amount,
  details,
  action,
}: {
  readonly icon: LucideIcon;
  readonly tone: DocumentTone;
  /** The record's route; the number opens it in the drawer. */
  readonly to: string;
  readonly number: ReactNode;
  /** What the document says it is about: a description, a fault. */
  readonly title?: string | null;
  /** The document's type or method, e.g. 维保合同 / 送修. */
  readonly kind?: ReactNode;
  /** A status tag. */
  readonly status?: ReactNode;
  /** Its money, formatted, shown at the right. */
  readonly amount?: string | null;
  /** The small line: dates, parties. Empty entries are skipped. */
  readonly details: readonly (string | null | undefined | false)[];
  /** A control at the right, e.g. completing a repair where no page header offers it. */
  readonly action?: ReactNode;
}): ReactElement {
  const line = details.filter(Boolean);
  return (
    <li className='grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 px-4 py-3 transition-colors hover:bg-muted/40 @lg:flex @lg:items-center @lg:gap-3'>
      <span
        className={`hidden size-9 shrink-0 items-center justify-center rounded-full @lg:flex ${TONES[tone]}`}
      >
        <Icon className='size-4' aria-hidden='true' strokeWidth={1.75} />
      </span>
      <div className='contents @lg:block @lg:min-w-0 @lg:flex-1 @lg:space-y-1'>
        <div className='contents @lg:flex @lg:min-w-0 @lg:items-baseline @lg:gap-2'>
          <RecordLink
            to={to}
            className='col-start-1 row-start-1 min-w-0 self-center font-medium text-link @lg:shrink-0'
          >
            {number}
          </RecordLink>
          {title ? (
            <span
              className='col-span-2 line-clamp-2 min-w-0 text-foreground @lg:line-clamp-none @lg:truncate'
              title={title}
            >
              {title}
            </span>
          ) : null}
        </div>
        {kind || line.length > 0 ? (
          // Each dot sits left of its entry, in the gap, and the frame clips
          // the one on an entry that wrapped to the start of a line
          // (2026-11-04): a dot left there hung beside the text.
          <div className='col-span-2 overflow-hidden'>
            <p className='-ml-3 flex flex-wrap items-center gap-y-0.5 text-xs text-muted-foreground'>
              {kind ? (
                <span className='ml-3 min-w-0 rounded bg-muted px-1.5 py-px text-foreground/80'>
                  {kind}
                </span>
              ) : null}
              {line.map((item, index) => (
                <span className='relative ml-3 min-w-0' key={String(item)}>
                  {/* A drawn dot, not "·": in a Chinese font the character
                      is full width and doubled the gap on each side
                      (2026-10-23). */}
                  {index > 0 || kind ? (
                    <span
                      aria-hidden='true'
                      className='absolute top-[calc(0.5lh-1.5px)] -left-[7.5px] size-[3px] rounded-full bg-muted-foreground/40'
                    />
                  ) : null}
                  <span className='break-words'>{item}</span>
                </span>
              ))}
            </p>
          </div>
        ) : null}
      </div>
      {status || amount ? (
        <div className='contents @lg:flex @lg:shrink-0 @lg:flex-col @lg:items-end @lg:gap-1'>
          {status ? (
            <div className='col-start-2 row-start-1 flex justify-end'>
              {status}
            </div>
          ) : null}
          {amount ? (
            <span className='col-span-2 text-sm font-medium tabular-nums'>
              {amount}
            </span>
          ) : null}
        </div>
      ) : null}
      {action ? (
        <div className='col-span-2 mt-1 @lg:mt-0 @lg:shrink-0 @lg:self-center'>
          {action}
        </div>
      ) : null}
    </li>
  );
}

/** The bordered list the document cards sit in. */
export function DocumentList({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  return (
    <ul className='@container divide-y divide-border overflow-hidden rounded-lg border border-border bg-card text-sm'>
      {children}
    </ul>
  );
}
