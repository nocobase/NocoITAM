import type { ReactElement, ReactNode } from 'react';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface StatCard {
  readonly key: string;
  readonly label: ReactNode;
  readonly value: ReactNode;
  /** One line explaining how the number is computed. */
  readonly caption?: ReactNode;
  readonly onClick?: () => void;
  readonly active?: boolean;
  readonly tone?: 'default' | 'warning' | 'destructive';
}

/** Clickable statistics with a caption stating their definition. */
export function StatCards({
  cards,
}: {
  readonly cards: readonly StatCard[];
}): ReactElement {
  return (
    <div className='grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-3'>
      {cards.map((card) => {
        const content = (
          <CardContent className='flex h-full flex-col gap-1 p-4'>
            <div className='text-sm text-muted-foreground'>{card.label}</div>
            <div
              className={cn(
                'font-heading text-2xl font-semibold tabular-nums',
                card.tone === 'warning' && 'text-warning-foreground',
                card.tone === 'destructive' && 'text-destructive',
              )}
            >
              {card.value}
            </div>
            {card.caption ? (
              <div className='text-xs text-muted-foreground'>
                {card.caption}
              </div>
            ) : null}
          </CardContent>
        );
        return (
          <Card
            key={card.key}
            className={cn(
              'py-0',
              card.onClick &&
                'cursor-pointer transition-colors hover:bg-muted/50',
              card.active && 'border-primary',
            )}
            {...(card.onClick
              ? {
                  role: 'button',
                  tabIndex: 0,
                  onClick: card.onClick,
                  onKeyDown: (event: React.KeyboardEvent) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      card.onClick?.();
                    }
                  },
                }
              : {})}
          >
            {content}
          </Card>
        );
      })}
    </div>
  );
}
