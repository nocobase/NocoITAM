import { useTranslation } from '@nocobase/i18n/client';
import { CheckCheck } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useParams } from 'react-router';

import { AttachmentsTab } from '@/components/itam/attachments-tab';
import { RECORD_SUMMARIES } from '@/components/itam/record-summaries';
import { SummaryLead } from '@/components/itam/summary-lead';
import { RepairCompleteDialog } from '@/components/itam/repair-complete';
import { RepairCreateDialog } from '@/components/itam/repair-create-dialog';
import { Button } from '@/components/ui/button';
import type { ItamRecord } from '@/lib/itam/api';
import { text } from '@/lib/itam/format';
import type { DomainConfig } from '@/lib/itam/domain';
import {
  REPAIRS_PATH,
  REPAIR_CREATE_FIELDS,
  REPAIR_FIELDS,
} from '@/lib/itam/operations';
import {
  useCollectionPermissions,
  useCurrentUserId,
} from '@/lib/itam/permissions';

/**
 * Repairs as documents: RP-000001 with a list of their own. The list creates
 * one for any device; the device and vendor tabs list the same rows
 * with the device already chosen.
 */
// eslint-disable-next-line react-refresh/only-export-components -- a domain config is data that references its components
export const repairDomain: DomainConfig = {
  name: 'repairs',
  path: REPAIRS_PATH,
  route: 'repairs',
  i18n: 'repairs',
  fields: REPAIR_FIELDS,
  createFields: ['deviceId', ...REPAIR_CREATE_FIELDS],
  nameField: 'repairNo',
  defaultSort: 'createdAt',
  // A record made by mistake goes; the device comes back from repair.
  // Who may delete is the grant's alone — the asset manager's and root's —
  // so the page offers it wherever `delete` is held.
  // Beside 完成维修 in the header; deletion goes in the "more" menu.
  deleteInMenu: true,
  tabs: [{ key: 'attachments', label: 'tabs.attachments' }],
  Actions: RepairActions,
  // The device's facts and 维修单整理 beside the form, as from a device's
  // page (2026-10-17).
  Create: ({ open, onOpenChange, onCreated }) => (
    <RepairCreateDialog
      open={open}
      onOpenChange={onOpenChange}
      onCreated={onCreated}
    />
  ),
  summaryTimestamps: false,
  // The summary leads 基本信息 (2026-10-16); no summary strip.
  BasicLead: ({ record }) => (
    <SummaryLead record={record} summary={RECORD_SUMMARIES.repairs} />
  ),
};

/** 完成维修 on the detail page while the repair is in progress. */
function RepairActions({
  record,
}: {
  readonly record: ItamRecord;
}): ReactElement | null {
  const { t } = useTranslation();
  const permissions = useCollectionPermissions('repairs', [
    'complete',
    'delete',
  ]);
  const currentUserId = useCurrentUserId();
  const [completing, setCompleting] = useState(false);
  // Finishing a repair belongs to its 负责人, or to whoever supervises
  // repairs — holds `delete` on them, the asset manager and root. The
  // service refuses anyone else (`NOT_OWNER`), and a rule the page states
  // and the service does not enforce is not a rule — nor the other way
  // round.
  if (
    !permissions.complete ||
    record.result !== 'inProgress' ||
    (text(record.ownerId) !== currentUserId && !permissions.delete)
  )
    return null;
  return (
    <>
      <Button onClick={() => setCompleting(true)}>
        <CheckCheck data-icon='inline-start' />
        {t('repairs.complete')}
      </Button>
      {completing ? (
        <RepairCompleteDialog
          repair={record}
          onClose={() => setCompleting(false)}
        />
      ) : null}
    </>
  );
}

export function RepairAttachmentsTab(): ReactElement {
  const { id = '' } = useParams();
  return <AttachmentsTab ownerType='repairs' ownerId={id} />;
}
