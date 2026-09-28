import type { ReactElement } from 'react';

import { PurchasesTab } from '@/components/itam/purchases-tab';
import { STOCK_PATH } from '@/lib/itam/stock';

export default function Page(): ReactElement {
  return <PurchasesTab path={STOCK_PATH} />;
}
