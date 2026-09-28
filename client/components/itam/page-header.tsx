import type { ReactElement, ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';

export interface PageHeaderProps {
  readonly title: ReactNode;
  /** Server-side total shown beside the title. */
  readonly total?: number;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
  readonly breadcrumb?: ReactNode;
}

/** The header every ITAM page starts with: title, total, actions. */
export function PageHeader({
  title,
  total,
  description,
  actions,
  breadcrumb,
}: PageHeaderProps): ReactElement {
  return (
    // Wraps by its own room, not the window's: beside the assistant panel a
    // wide window still leaves the page narrow, and the actions then move
    // under the title instead of squeezing it to nothing.
    <header className='flex flex-wrap items-center justify-between gap-x-6 gap-y-3'>
      <div className='min-w-0 flex-[1_1_16rem] space-y-1'>
        {breadcrumb ? (
          <div className='text-sm text-muted-foreground'>{breadcrumb}</div>
        ) : null}
        <div className='flex items-center gap-2'>
          <h1 className='truncate font-heading text-2xl font-semibold tracking-tight'>
            {title}
          </h1>
          {total !== undefined ? (
            <Badge variant='secondary' className='tabular-nums'>
              {total}
            </Badge>
          ) : null}
        </div>
        {description ? (
          <p className='text-sm text-muted-foreground'>{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className='flex shrink-0 flex-wrap items-center gap-2'>
          {actions}
        </div>
      ) : null}
    </header>
  );
}

/**
 * Standard page container so every page shares the same spacing. It is a
 * size container too: the assistant panel narrows the page while the
 * window stays wide, so a page's own splits use `@3xl:`-style breakpoints
 * (its width), not `lg:` (the window's).
 */
export function Page({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  return (
    <section className='@container mx-auto w-full max-w-7xl space-y-6 p-6'>
      {children}
    </section>
  );
}
