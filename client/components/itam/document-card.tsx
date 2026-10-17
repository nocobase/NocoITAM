import type { LucideIcon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import { RecordLink } from './record-link.js';

/** Each kind's icon, tinted as the rest of the application tints it. */
const TONES = {
  purchase: 'bg-primary/10 text-primary',
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
 * line up down the list.
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
    <li className='flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40'>
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-full ${TONES[tone]}`}
      >
        <Icon className='size-4' aria-hidden='true' strokeWidth={1.75} />
      </span>
      <div className='min-w-0 flex-1 space-y-1'>
        <div className='flex min-w-0 items-baseline gap-2'>
          <RecordLink
            to={to}
            className='shrink-0 font-medium text-link underline-offset-4 hover:underline'
          >
            {number}
          </RecordLink>
          {title ? (
            <span className='min-w-0 truncate text-foreground' title={title}>
              {title}
            </span>
          ) : null}
        </div>
        {kind || line.length > 0 ? (
          <p className='flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground'>
            {kind ? (
              <span className='rounded bg-muted px-1.5 py-px text-foreground/80'>
                {kind}
              </span>
            ) : null}
            {line.map((item, index) => (
              <span
                className='inline-flex items-center gap-1.5'
                key={String(item)}
              >
                {index > 0 || kind ? (
                  <span aria-hidden='true' className='text-border'>
                    ·
                  </span>
                ) : null}
                <span className='break-words'>{item}</span>
              </span>
            ))}
          </p>
        ) : null}
      </div>
      {status || amount ? (
        <div className='flex shrink-0 flex-col items-end gap-1'>
          {status}
          {amount ? (
            <span className='text-sm font-medium tabular-nums'>{amount}</span>
          ) : null}
        </div>
      ) : null}
      {action ? <div className='shrink-0 self-center'>{action}</div> : null}
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
    <ul className='divide-y divide-border overflow-hidden rounded-lg border border-border bg-card text-sm'>
      {children}
    </ul>
  );
}
