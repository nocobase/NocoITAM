import type { LucideIcon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import { RecordLink } from './record-link.js';

/**
 * One document (purchase order, repair, disposal) as a card in a
 * record's related-documents lists. Every kind has the same shape: an icon
 * tile, then the number (a link to the record) with its type and status on
 * the first line and the details in small text underneath.
 */
export function DocumentCard({
  icon: Icon,
  to,
  number,
  kind,
  status,
  details,
  action,
}: {
  readonly icon: LucideIcon;
  /** The record's route; the number opens it in the drawer. */
  readonly to: string;
  readonly number: ReactNode;
  /** The document's type or method, e.g. 维保合同 / 送修. */
  readonly kind?: ReactNode;
  /** A status tag. */
  readonly status?: ReactNode;
  /** The small line: dates, amounts, parties. Empty entries are skipped. */
  readonly details: readonly (string | null | undefined | false)[];
  /** A control at the right, e.g. completing a repair where no page header offers it. */
  readonly action?: ReactNode;
}): ReactElement {
  const line = details.filter(Boolean).join(' · ');
  return (
    <li className='flex items-start gap-3 px-4 py-3'>
      <span className='flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground'>
        <Icon className='size-4' aria-hidden='true' />
      </span>
      <div className='min-w-0 flex-1 space-y-1'>
        <div className='flex flex-wrap items-center gap-x-2 gap-y-1'>
          <RecordLink
            to={to}
            className='font-medium text-link underline-offset-4 hover:underline'
          >
            {number}
          </RecordLink>
          {kind ? <span className='text-foreground'>{kind}</span> : null}
          {status}
        </div>
        {line ? (
          <p className='line-clamp-2 text-xs break-words text-muted-foreground'>
            {line}
          </p>
        ) : null}
      </div>
      {action ? <div className='shrink-0'>{action}</div> : null}
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
    <ul className='divide-y divide-border rounded-lg border border-border bg-card text-sm'>
      {children}
    </ul>
  );
}
