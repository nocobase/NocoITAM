import type { ComponentProps } from 'react';
import { cn } from 'cn';

/**
 * Application change (ITAM, 2026-10-16, as NocoCRM's): the header on the
 * page's own light grey, frosted, rather than the cards' white.
 */
export function LayoutHeader({
  className,
  ...props
}: ComponentProps<'header'>) {
  return (
    <header
      className={cn(
        'flex h-16 shrink-0 items-center border-b border-border bg-background/85 px-3 backdrop-blur-xl md:px-4',
        className,
      )}
      {...props}
    />
  );
}
