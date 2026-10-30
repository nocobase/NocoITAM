import type { ReactElement } from 'react';

import { AssetTypeBadge } from '@/components/itam/asset-type-badge';
import { EntitlementKindBadge } from '@/components/itam/status-badge';
import { text } from '@/lib/itam/format';

const ENTITLEMENT_KINDS = new Set<string>(['perpetual', 'subscription']);

/**
 * What a purchase line buys, as a type: one of the five asset types, and for
 * an entitlement the kind tag its own page uses, so the two say the same
 * thing. Shared by the order's lines and 到货入库 (2026-10-30).
 */
export function LineTypeBadge({
  itemType,
}: {
  readonly itemType: unknown;
}): ReactElement {
  const value = text(itemType);
  const entitlement = ENTITLEMENT_KINDS.has(value);
  return (
    <span className='inline-flex items-center gap-2'>
      <AssetTypeBadge value={entitlement ? 'entitlement' : value} />
      {entitlement ? <EntitlementKindBadge kind={itemType} /> : null}
    </span>
  );
}
