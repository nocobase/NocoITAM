import { Fragment, type ReactElement } from 'react';

import type { ItemOwner } from '@/lib/itam/kit-items';
import { cn } from '@/lib/utils';

import { RecordLink } from './record-link.js';

/**
 * An item's category and maker, each opening its record in the drawer
 * (2026-10-28): what a kit and a joiner's card say beside a model or a
 * software product.
 */
export function ItemOwners({
  owners,
  className,
}: {
  readonly owners: readonly ItemOwner[];
  readonly className?: string;
}): ReactElement | null {
  if (owners.length === 0) return null;
  return (
    <span className={cn('truncate text-muted-foreground', className)}>
      {owners.map((owner, index) => (
        <Fragment key={`${owner.route}:${owner.id}`}>
          {index > 0 ? ' · ' : null}
          <RecordLink
            to={`/${owner.route}/${owner.id}`}
            className='text-muted-foreground hover:text-foreground'
          >
            {owner.name}
          </RecordLink>
        </Fragment>
      ))}
    </span>
  );
}
