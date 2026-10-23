import { useContext, type MouseEvent, type ReactElement } from 'react';
import { Link, type LinkProps } from 'react-router';

import { RecordDrawerContext } from '@/lib/itam/record-drawer';
import { cn } from '@/lib/utils';
import { recordOrTabTarget } from '@/lib/itam/record-view';

/** A plain left click; modified clicks keep their browser meaning (new tab). */
const isPlainClick = (event: MouseEvent): boolean =>
  event.button === 0 &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.shiftKey &&
  !event.altKey;

export interface RecordLinkProps extends Omit<LinkProps, 'to'> {
  readonly to: string;
  /** `false` keeps the link a page navigation even inside a detail page. */
  readonly drawer?: boolean;
}

/**
 * A link to a record. It renders as an ordinary link — the address works
 * in a new tab and for copying — but a plain click inside a detail page
 * opens the record in the drawer (see `@/lib/itam/record-drawer`).
 */
export function RecordLink({
  to,
  drawer = true,
  onClick,
  target,
  className,
  ...props
}: RecordLinkProps): ReactElement {
  const api = useContext(RecordDrawerContext);
  return (
    <Link
      to={to}
      target={target}
      // A text link underlines on hover, across the application
      // (2026-10-23): not a ground, not another colour. A link wrapping a
      // tag says hover:no-underline.
      className={cn('underline-offset-4 hover:underline', className)}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          !drawer ||
          !api ||
          (target && target !== '_self') ||
          !isPlainClick(event) ||
          !recordOrTabTarget(to)
        )
          return;
        event.preventDefault();
        // The link took the click; a clickable row around it must not also
        // navigate to its own record.
        event.stopPropagation();
        api.open(to);
      }}
      {...props}
    />
  );
}
