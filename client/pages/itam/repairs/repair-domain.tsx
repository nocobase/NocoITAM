import { useTranslation } from '@nocobase/i18n/client';
import { CheckCheck, ReceiptText } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactElement } from 'react';
import { useNavigate, useParams } from 'react-router';

import { AttachmentsTab } from '@/components/itam/attachments-tab';
import { RECORD_SUMMARIES } from '@/components/itam/record-summaries';
import { SummaryLead } from '@/components/itam/summary-lead';
import { RepairCompleteDialog } from '@/components/itam/repair-complete';
import { RepairCreateDialog } from '@/components/itam/repair-create-dialog';
import { QuoteAdvice, RepairQuoteDialog } from '@/components/itam/repair-quote';
import { ConfirmDialog } from '@/components/itam/confirm-dialog';
import { Button } from '@/components/ui/button';
import { DisposalCreateDialog } from '../disposals/create-dialog.js';
import { useApi, type ItamRecord } from '@/lib/itam/api';
import { formatMoney, text } from '@/lib/itam/format';
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
  // 修还是换 under the quote (2026-10-23).
  fieldDisplay: (field, record) =>
    field.key === 'quoteRecommendation' ? (
      <QuoteDecision record={record} />
    ) : undefined,
  // The device's facts and 维修单整理 beside the form, as from a device's
  // page (2026-10-17).
  Create: RepairCreate,
  summaryTimestamps: false,
  // The summary leads 基本信息 (2026-10-16); no summary strip.
  BasicLead: ({ record }) => (
    <SummaryLead record={record} summary={RECORD_SUMMARIES.repairs} />
  ),
};

/**
 * A new repair from the list, which may turn into a disposal when Asset
 * Steward advises replacing the device (2026-10-20): the repair form gives
 * way to the disposal one for the same device and fault, and a disposal
 * made opens its page.
 */
function RepairCreate({
  open,
  onOpenChange,
  onCreated,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCreated: (record: ItamRecord) => void;
}): ReactElement {
  const navigate = useNavigate();
  const [replacing, setReplacing] = useState<{
    readonly deviceId: string;
    readonly description: string;
  }>();
  return (
    <>
      <RepairCreateDialog
        open={open && !replacing}
        onOpenChange={onOpenChange}
        onCreated={onCreated}
        onReplace={setReplacing}
      />
      {replacing ? (
        <DisposalCreateDialog
          open
          onOpenChange={(next) => {
            if (next) return;
            setReplacing(undefined);
            onOpenChange(false);
          }}
          deviceIds={[replacing.deviceId]}
          initial={{
            reason: 'uneconomicalRepair',
            description: replacing.description,
          }}
          onCreated={(created) => {
            setReplacing(undefined);
            onOpenChange(false);
            void navigate(`/disposals/${String(created.id)}`);
          }}
        />
      ) : null}
    </>
  );
}

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
    'update',
  ]);
  const currentUserId = useCurrentUserId();
  const [completing, setCompleting] = useState(false);
  const [quoting, setQuoting] = useState(false);
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
      {/* The vendor's quote, and 修还是换 at that price (2026-10-23). */}
      {permissions.update ? (
        <Button variant='outline' onClick={() => setQuoting(true)}>
          <ReceiptText data-icon='inline-start' />
          {t(
            record.quoteAmount === null || record.quoteAmount === undefined
              ? 'repairs.quote.record'
              : 'repairs.quote.update',
          )}
        </Button>
      ) : null}
      {quoting ? (
        <RepairQuoteDialog repair={record} onClose={() => setQuoting(false)} />
      ) : null}
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

/**
 * The quote's advice with 继续维修 / 改为报废, for whoever may finish the
 * repair. 改为报废 closes the repair as not repaired with the device going
 * to pending disposal, then opens the disposal for it, filled from the
 * quote and the advice; leaving that dialog keeps the device pending
 * disposal, where the disposals list picks it up.
 */
function QuoteDecision({
  record,
}: {
  readonly record: ItamRecord;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const permissions = useCollectionPermissions('repairs', [
    'complete',
    'delete',
  ]);
  const currentUserId = useCurrentUserId();
  const [confirming, setConfirming] = useState(false);
  const [disposing, setDisposing] = useState(false);
  const canDecide =
    permissions.complete &&
    (text(record.ownerId) === currentUserId || permissions.delete);
  const quote = formatMoney(record.quoteAmount, text(record.currency));
  const replace = useMutation({
    mutationFn: async () => {
      const path = `${REPAIRS_PATH}/${text(record.id)}`;
      await api.request({
        path,
        method: 'PATCH',
        json: { quoteDecision: 'replace' },
      });
      await api.request({
        path: `${path}/complete`,
        method: 'POST',
        json: {
          result: 'unrepairable',
          disposition: 'dispose',
          notes: t('repairs.quote.replacedNote', { quote }),
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['itam'] });
      setConfirming(false);
      setDisposing(true);
    },
  });
  return (
    <>
      <QuoteAdvice
        repair={record}
        canDecide={canDecide}
        onReplace={() => setConfirming(true)}
      />
      <ConfirmDialog
        open={confirming}
        onOpenChange={(open) => !open && setConfirming(false)}
        title={t('repairs.quote.replace')}
        description={t('repairs.quote.replaceDescription')}
        busy={replace.isPending}
        error={replace.error}
        confirmLabel={t('repairs.quote.replace')}
        onConfirm={() => replace.mutate()}
      />
      {disposing ? (
        <DisposalCreateDialog
          open
          onOpenChange={(next) => !next && setDisposing(false)}
          deviceIds={[text(record.deviceId)]}
          initial={{
            reason: 'uneconomicalRepair',
            description: t('repairs.quote.disposalNote', {
              fault: text(record.faultDescription),
              quote,
              reasons: text(record.quoteReasons),
            }),
          }}
          onCreated={(created) => {
            setDisposing(false);
            void navigate(`/disposals/${String(created.id)}`);
          }}
        />
      ) : null}
    </>
  );
}

export function RepairAttachmentsTab(): ReactElement {
  const { id = '' } = useParams();
  return <AttachmentsTab ownerType='repairs' ownerId={id} />;
}
