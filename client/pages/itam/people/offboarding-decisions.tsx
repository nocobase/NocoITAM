import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { SuggestionBlock } from '@/components/itam/ai/suggestion-card';
import type { ItamRecord } from '@/lib/itam/api';
import { text } from '@/lib/itam/format';

import { usePersonHoldings } from './holdings.js';

/**
 * A person's 等你决定 (`DomainConfig.Decisions`, 2026-10-17, plan "Work
 * agents", step 2): 离职回收's suggestion for the reader's part of a
 * leaver's things. While someone who has left still holds anything and no
 * suggestion is open, one line offers to ask for one; the holdings come
 * from the same query as the 归属 tab.
 */
export function OffboardingDecisions({
  record,
}: {
  readonly record: ItamRecord;
}): ReactElement {
  const { t } = useTranslation();
  const id = text(record.id);
  const left = record.employmentStatus === 'left';
  const holdings = usePersonHoldings(left ? id : undefined);
  const holds = holdings.data
    ? holdings.data.devices.length +
        holdings.data.stock.length +
        holdings.data.entitlementSeats.length >
      0
    : false;
  return (
    <SuggestionBlock
      agent='offboarding'
      subjectType='people'
      subjectId={id}
      offer={left && holds}
      offerText={t('suggestion.offer.offboarding')}
    />
  );
}
