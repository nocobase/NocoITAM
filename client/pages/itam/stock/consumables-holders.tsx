import type { ReactElement } from 'react';
import { useParams } from 'react-router';

import { StockHoldersTab } from './stock-domain.js';

export default function Page(): ReactElement {
  const { id = '' } = useParams();
  return <StockHoldersTab kind='consumable' id={id} />;
}
