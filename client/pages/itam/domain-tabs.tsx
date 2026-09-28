import { useMemo, type ReactElement, type ReactNode } from 'react';
import { useParams } from 'react-router';

import { HistoryTimeline } from '@/components/itam/history-timeline';
import { useItamRecord, type ItamRecord } from '@/lib/itam/api';
import type { FieldDefinition } from '@/lib/itam/fields';

/**
 * The record's timeline, bound to an API path. Field labels that depend on
 * the record (a subscription's term dates) read as its detail page shows
 * them, so a change says 本期结束 where the card does.
 */
export function DomainHistoryTab({
  path,
  fields,
  fieldDisplay,
}: {
  readonly path: string;
  readonly fields?: readonly FieldDefinition[];
  /** The domain's own rendering of a field, reused for its changes. */
  readonly fieldDisplay?: (
    field: FieldDefinition,
    record: ItamRecord,
  ) => ReactNode | undefined;
}): ReactElement {
  const { id = '' } = useParams();
  const record = useItamRecord<ItamRecord>(path, id);
  const resolved = useMemo(
    () =>
      record.data && fields
        ? fields.map((field) =>
            field.labelWhen
              ? { ...field, label: field.labelWhen(record.data) ?? field.label }
              : field,
          )
        : fields,
    [fields, record.data],
  );
  return (
    <HistoryTimeline
      path={path}
      id={id}
      fields={resolved}
      displayValue={
        fieldDisplay
          ? (field, value) => fieldDisplay(field, { id, [field.key]: value })
          : undefined
      }
      currency={
        typeof record.data?.currency === 'string' ? record.data.currency : null
      }
    />
  );
}
