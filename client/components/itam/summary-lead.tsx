import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { InfoRow } from '@/components/itam/detail-page';
import type { RecordSummary } from '@/components/itam/record-summaries';
import type { ItamRecord } from '@/lib/itam/api';

/**
 * A record's summary as the first rows of its 基本信息 (2026-10-16): what
 * the strip above the information card said — status, approver, amounts —
 * read where the rest of the record is, as a device's status and holder
 * do. A domain passes it as its `BasicLead`; the summary's own fields stay
 * out of the card (`detail: false`), so nothing shows twice.
 */
export function SummaryLead({
  record,
  summary,
  only,
}: {
  readonly record: ItamRecord;
  readonly summary: RecordSummary;
  /** The summary's items to show, by key; all of them when absent. */
  readonly only?: readonly string[];
}): ReactElement {
  const { t } = useTranslation();
  return (
    <>
      {summary
        .items(record, t)
        .filter((item) => !only || only.includes(item.key))
        .map((item) => (
          <InfoRow key={item.key} label={item.label}>
            {item.value}
          </InfoRow>
        ))}
    </>
  );
}
