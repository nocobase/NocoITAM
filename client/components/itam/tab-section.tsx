import type { ReactElement, ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';

/**
 * One titled group of a tab that lists several kinds of record: the title
 * with its count, then the list. A group with nothing in it shows only its
 * title and a count of 0 instead of an empty box; most records hold or have
 * little of each kind. Used by the device and entitlement tabs.
 */
export function TabSection({
  title,
  count,
  children,
}: {
  readonly title: string;
  readonly count: number | undefined;
  readonly children: ReactNode;
}): ReactElement {
  // The count says a section is empty; a word beside it would say it twice.
  return (
    <section className='space-y-2'>
      <h3 className='flex items-center gap-2 font-heading text-sm font-semibold'>
        {title}
        {count === undefined ? null : (
          <Badge variant='secondary' className='tabular-nums'>
            {count}
          </Badge>
        )}
      </h3>
      {count ? children : null}
    </section>
  );
}
