import type { ReactElement } from 'react';

import { PurchasesTab } from '@/components/itam/purchases-tab';
import { ENTITLEMENTS_PATH } from '@/lib/itam/entitlements';

export default function Page(): ReactElement {
  return (
    <PurchasesTab
      path={ENTITLEMENTS_PATH}
      emptyKey='entitlements.noPurchases'
    />
  );
}
