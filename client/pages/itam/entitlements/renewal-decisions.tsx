import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { SuggestionBlock } from '@/components/itam/ai/suggestion-card';
import type { ItamRecord } from '@/lib/itam/api';
import { daysOverdue, formatDate, text } from '@/lib/itam/format';
import { useCurrentUserId } from '@/lib/itam/permissions';

/** How far ahead of its date an entitlement's 负责人 is offered a review. */
const OFFER_DAYS = 90;

/**
 * An entitlement's 等你决定 (`DomainConfig.Decisions`, 2026-10-17, plan
 * "Work agents", step 2): 授权续费's suggestion, for its 负责人. With none
 * open, one line offers to ask for one while a subscription's end or a
 * perpetual licence's maintenance falls within 90 days (or has passed).
 */
export function RenewalDecisions({
  record,
}: {
  readonly record: ItamRecord;
}): ReactElement {
  const { t } = useTranslation();
  const me = useCurrentUserId();
  const subscription = record.kind === 'subscription';
  const due = text(
    subscription ? record.expiryDate : record.maintenanceExpiryDate,
  );
  const offer =
    me !== undefined &&
    text(record.ownerId) === me &&
    Boolean(due) &&
    daysOverdue(due) >= -OFFER_DAYS;
  return (
    <SuggestionBlock
      agent='renewalReview'
      subjectType='entitlements'
      subjectId={text(record.id)}
      offer={offer}
      offerText={t(
        subscription
          ? 'suggestion.offer.renewal'
          : 'suggestion.offer.maintenance',
        { date: formatDate(due) },
      )}
    />
  );
}
