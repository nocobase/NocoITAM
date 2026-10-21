import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { stockTarget } from '@/lib/itam/related-targets';

import { RelatedListTab } from './related-list-tab.js';
import { stockTypeColumn } from './stock-type-column.js';

export default function Tab(): ReactElement {
  const { t } = useTranslation();
  return (
    <RelatedListTab
      target={stockTarget}
      filterField='locationId'
      countKind='none'
      leading={[stockTypeColumn(t)]}
    />
  );
}
