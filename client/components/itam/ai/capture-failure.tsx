import { CircleAlert, Sparkles } from 'lucide-react';
import type { ReactElement } from 'react';

import { CollapsibleText } from '@/components/itam/collapsible-text';
import { cn } from '@/lib/utils';

/**
 * When an AI 整理 fills nothing (2026-10-21). The model answering that it
 * needs more — a product name, a clearer document — is its reply, drawn as
 * the AI's own words beside the form are; only something going wrong (the
 * network, the server, an unreadable file) is red.
 */
export function CaptureFailure({
  text,
  answered,
  inline = false,
  className,
}: {
  readonly text: string;
  /** The model answered and filled nothing, rather than failing. */
  readonly answered: boolean;
  /** Among the turns of an adjustment: no box of its own. */
  readonly inline?: boolean;
  readonly className?: string;
}): ReactElement {
  if (answered)
    return (
      <p
        className={cn(
          'flex gap-2 text-sm',
          inline
            ? 'max-w-[90%] text-muted-foreground'
            : 'rounded-lg border border-border bg-muted/40 p-3',
          className,
        )}
      >
        <Sparkles
          className={cn(
            'mt-0.5 shrink-0 text-primary',
            inline ? 'size-3.5' : 'size-4',
          )}
        />
        <span className='min-w-0'>
          <CollapsibleText text={text} chars={200} lines={4} />
        </span>
      </p>
    );
  return (
    <p className={cn('flex gap-2 text-sm text-destructive', className)}>
      <CircleAlert className='mt-0.5 size-4 shrink-0' />
      <span className='min-w-0'>
        <CollapsibleText text={text} chars={160} lines={3} />
      </span>
    </p>
  );
}
