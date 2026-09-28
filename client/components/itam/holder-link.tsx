import type { ReactElement } from 'react';

import { ReferenceLink } from './cells.js';
import { HolderIcon } from './device-relation.js';
import {
  referenceRoute,
  useReferenceNames,
  type ReferenceNames,
} from '@/lib/itam/references';

const collectionOf = (holderType: string): string =>
  holderType === 'person'
    ? 'people'
    : holderType === 'location'
      ? 'locations'
      : 'devices';

/**
 * Who holds something, on one line: the icon says whether it went to a
 * person, a place or a device, and the name links to it. Stock movements and
 * entitlement seats read the same way because they render the same cell.
 *
 * Takes the names the caller already loaded; `HolderLink` is the variant that
 * loads its own.
 */
export function HolderCell({
  holderType,
  holderId,
  names,
}: {
  readonly holderType: string;
  readonly holderId: string;
  readonly names: ReferenceNames | undefined;
}): ReactElement {
  const collection = collectionOf(holderType);
  return (
    <span className='inline-flex items-center gap-1'>
      <HolderIcon type={holderType} />
      <ReferenceLink
        collection={collection}
        route={referenceRoute(collection)}
        id={holderId}
        names={names}
      />
    </span>
  );
}

/** The same cell, loading the holder's name itself. */
export function HolderLink({
  holderType,
  holderId,
}: {
  readonly holderType: string;
  readonly holderId: string;
}): ReactElement {
  const collection = collectionOf(holderType);
  const names = useReferenceNames([{ collection, ids: [holderId] }]);
  return (
    <HolderCell
      holderType={holderType}
      holderId={holderId}
      names={names[collection]}
    />
  );
}
