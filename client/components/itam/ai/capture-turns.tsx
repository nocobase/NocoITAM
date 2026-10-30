import { Sparkles } from 'lucide-react';
import { useEffect, useRef, type ReactElement, type ReactNode } from 'react';

import { CollapsibleText } from '@/components/itam/collapsible-text';
import { cn } from '@/lib/utils';

export interface CaptureTurn {
  readonly id: string;
  readonly from: 'user' | 'ai';
  readonly text: string;
}

/**
 * The adjustments asked of an AI 整理 beside its form, and what the AI said
 * to each (2026-10-30). They scroll in a box of their own, newest in view,
 * so asking again and again does not make the dialog taller: at most 16rem,
 * or as tall as the column around it lets it be (`className`).
 */
export function CaptureTurns({
  turns,
  children,
  className,
}: {
  readonly turns: readonly CaptureTurn[];
  /** After the last turn: a reading that came back empty or failed. */
  readonly children?: ReactNode;
  /** In place of the box's own height limit, e.g. to fill a column. */
  readonly className?: string;
}): ReactElement | null {
  const boxRef = useRef<HTMLDivElement>(null);
  const last = turns.at(-1)?.id;
  const tail = Boolean(children);
  useEffect(() => {
    // The box only, never the dialog around it.
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [last, tail]);
  if (!turns.length && !children) return null;
  return (
    <div
      ref={boxRef}
      className={cn(
        '-mr-1 grid content-start gap-2 overflow-y-auto pr-1',
        className ?? 'max-h-64',
      )}
    >
      {turns.map((turn) =>
        turn.from === 'user' ? (
          <p
            key={turn.id}
            className='ml-auto max-w-[90%] rounded-lg bg-background px-3 py-1.5 whitespace-pre-wrap'
          >
            {turn.text}
          </p>
        ) : (
          <p
            key={turn.id}
            className='flex max-w-[90%] gap-1.5 text-muted-foreground'
          >
            <span className='flex h-[1lh] shrink-0 items-center'>
              <Sparkles className='size-3.5 text-primary' />
            </span>
            <span className='min-w-0'>
              <CollapsibleText text={turn.text} chars={200} lines={3} />
            </span>
          </p>
        ),
      )}
      {children}
    </div>
  );
}
