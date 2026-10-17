import type { ReactElement, ReactNode } from 'react';

/**
 * One titled group of a tab that lists several kinds of record: the title
 * with its count, then the list. A group with nothing in it shows only its
 * title and a count of 0 instead of an empty box; most records hold or have
 * little of each kind. Used by the device and entitlement tabs.
 */
export function TabSection({
  title,
  count,
  empty,
  children,
}: {
  readonly title: string;
  readonly count: number | undefined;
  /** One line under an empty section (2026-10-17): the count alone read as a missing list. */
  readonly empty?: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <section className='space-y-2'>
      <h3 className='flex items-center gap-2 font-heading text-sm font-semibold'>
        {title}
        {/* Muted like a tab's count, not a pill (2026-10-16). */}
        {count === undefined ? null : (
          <span className='text-sm font-normal text-muted-foreground tabular-nums'>
            {count}
          </span>
        )}
      </h3>
      {count ? (
        children
      ) : count === 0 && empty ? (
        <p className='rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground'>
          {empty}
        </p>
      ) : null}
    </section>
  );
}
