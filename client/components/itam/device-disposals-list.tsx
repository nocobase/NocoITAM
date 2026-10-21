import { useTranslation } from '@nocobase/i18n/client';
import { Recycle } from 'lucide-react';
import type { ReactElement } from 'react';

import { EnumBadge } from '@/components/itam/cells';
import { EmptyState } from '@/components/itam/empty-state';
import { Paged } from '@/components/itam/paged';
import { DocumentCard, DocumentList } from '@/components/itam/document-card';
import type { ItamRecord } from '@/lib/itam/api';
import { formatDate, text } from '@/lib/itam/format';
import { useDeviceDisposals } from '@/lib/itam/device-disposals';
import { DISPOSAL_FIELDS } from '@/lib/itam/operations';

const STATUS_FIELD = DISPOSAL_FIELDS.find((field) => field.key === 'status')!;

export function DeviceDisposalsList({
  deviceId,
}: {
  readonly deviceId: string;
}): ReactElement {
  const { t } = useTranslation();
  const list = useDeviceDisposals(deviceId);
  const rows = list.data ?? [];
  if (list.data && rows.length === 0)
    return <EmptyState title={t('disposals.noneForDevice')} />;
  return <DisposalCards rows={rows} />;
}

/**
 * Disposals as document cards — number, description, method, status, then
 * the reason and when it was requested and carried out — on a device's
 * page and a vendor's (2026-10-21).
 */
export function DisposalCards({
  rows,
}: {
  readonly rows: readonly ItamRecord[];
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Paged rows={rows}>
      {(pageRows) => (
        <DocumentList>
          {pageRows.map((row) => (
            <DocumentCard
              key={text(row.id)}
              icon={Recycle}
              tone='disposal'
              to={`/disposals/${text(row.id)}`}
              number={text(row.disposalNo)}
              title={text(row.description) || null}
              kind={t(`enums.disposalMethod.${text(row.method)}`, {
                defaultValue: text(row.method),
              })}
              status={<EnumBadge field={STATUS_FIELD} value={row.status} />}
              details={[
                t(`enums.disposalReason.${text(row.reason)}`, {
                  defaultValue: text(row.reason),
                }),
                // Requested, then carried out.
                row.requestedAt
                  ? `${formatDate(row.requestedAt)}${
                      row.status === 'executed' && row.disposedAt
                        ? ` → ${formatDate(row.disposedAt)}`
                        : ''
                    }`
                  : '',
              ]}
            />
          ))}
        </DocumentList>
      )}
    </Paged>
  );
}
