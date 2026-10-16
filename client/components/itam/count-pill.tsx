import type { ReactElement, ReactNode } from 'react';

/**
 * A count beside a heading: a board column's, a workbench column's, a list
 * page's total. One look for all of them (2026-10-16), small and quiet, so a
 * number reads as the heading's count rather than as a tag.
 */
export function CountPill({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  return (
    <span className='rounded-full bg-background px-1.5 text-xs leading-5 font-medium text-muted-foreground tabular-nums ring-1 ring-border/60'>
      {children}
    </span>
  );
}
