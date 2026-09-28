import { Sparkles } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactElement } from 'react';

import { cn } from '@/lib/utils';

/**
 * How every AI shortcut reads: green text with the sparkle, not a button, so
 * it sits beside a page's own actions without competing with them. It is
 * still a `<button>` for keyboard and screen readers.
 */
export function AiShortcut({
  className,
  children,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>): ReactElement {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-sm text-sm whitespace-nowrap font-medium text-success-foreground underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <Sparkles className='size-3.5 shrink-0' aria-hidden='true' />
      {children}
    </button>
  );
}
