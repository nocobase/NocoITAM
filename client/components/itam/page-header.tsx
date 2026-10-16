import type { ReactElement, ReactNode } from 'react';
import { CountPill } from './count-pill.js';

export interface PageHeaderProps {
  readonly title: ReactNode;
  /** Server-side total shown beside the title. */
  readonly total?: number;
  /** Beside the title, before the actions: a control about the page as a whole. */
  readonly aside?: ReactNode;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
  readonly breadcrumb?: ReactNode;
}

/** The header every ITAM page starts with: title, total, actions. */
export function PageHeader({
  title,
  total,
  aside,
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
          {total !== undefined ? <CountPill>{total}</CountPill> : null}
          {aside ? <div className='ml-2 min-w-0'>{aside}</div> : null}
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
 * (its width), not `lg:` (the window's). `fill` makes it as tall and as
 * wide as the window, so its last child can take the rest of the height
 * (`flex-1`): a board's columns reach the bottom and scroll their own
 * cards, and as many of them as fit are on screen.
 */
export function Page({
  children,
  fill = false,
}: {
  readonly children: ReactNode;
  readonly fill?: boolean;
}): ReactElement {
  return (
    <section
      // A filled page is a board: it takes the window's whole width, since
      // every column more on screen is a status the reader need not scroll
      // to, where a form or a table reads best at a measured width. Its
      // foot keeps room for the ask box floating over the bottom of the
      // page (assistant-dock.tsx), so the last row scrolls clear of it —
      // only while the box is there, which it marks on the root, and on a
      // board just enough to clear it (2026-10-16).
      className={`@container mx-auto w-full space-y-6 p-6 ${fill ? 'flex h-full flex-col [:root[data-ask-dock]_&]:pb-16' : 'max-w-7xl [:root[data-ask-dock]_&]:pb-24'}`}
    >
      {children}
    </section>
  );
}
