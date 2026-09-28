import { useTranslation } from '@nocobase/i18n/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCheck } from 'lucide-react';
import { useState, type ReactElement, type ReactNode } from 'react';

import { ConfirmDialog } from '@/components/itam/confirm-dialog';
import { FieldInput } from '@/components/itam/field-input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  useApi,
  useItamList,
  useItamRecord,
  useItamSettings,
  type ItamRecord,
} from '@/lib/itam/api';
import { DEVICES_PATH } from '@/lib/itam/device-api';
import { formatDate, text } from '@/lib/itam/format';
import { holderCollection } from '@/lib/itam/devices';
import {
  REPAIR_DISPOSITIONS,
  REPAIR_RESULTS,
  REPAIRS_PATH,
} from '@/lib/itam/operations';
import { useCollectionPermissions } from '@/lib/itam/permissions';
import { useReferenceNames } from '@/lib/itam/references';

/**
 * Where "return" actually takes the device: it kept its holder through the
 * repair, so it goes back to in use / on loan with them, else to stock. The
 * option names that destination so the choice is concrete.
 */
function useReturnLabel(device: ItamRecord | undefined): {
  /** The "return" option, naming where the device goes back to. */
  readonly label: string;
  /** The relation disposal ends, if any: 分配给 / 借出给 / 预留给 … */
  readonly relation?: string;
} {
  const { t } = useTranslation();
  // The holder, else whoever the device is reserved for (a reservation
  // survives the repair untouched).
  const holderId = device?.assigneeId ?? device?.reservedForId;
  const holderKey = holderId ? text(holderId) : null;
  const collection = holderCollection(
    device?.assigneeId ? device.assigneeType : device?.reservedForType,
  );
  const names = useReferenceNames([{ collection, ids: [holderKey] }]);
  if (!device) return { label: t('repairs.dispositions.return') };
  const status = device.assigneeId
    ? device.expectedReturnDate
      ? 'onLoan'
      : 'inUse'
    : 'inStock';
  const label = t('repairs.dispositions.returnTo', {
    status: t(`enums.deviceStatus.${status}`),
  });
  if (!holderKey) return { label };
  const holder = names[collection]?.get(holderKey) ?? '';
  const relation =
    status === 'onLoan'
      ? t('repairs.dispositions.lentTo', {
          holder,
          date: formatDate(device.expectedReturnDate),
        })
      : status === 'inUse'
        ? t('repairs.dispositions.assignedTo', { holder })
        : t('repairs.dispositions.reservedFor', {
            holder,
            date: formatDate(device.reservedUntil),
          });
  return { label: `${label}（${relation}）`, relation };
}

/**
 * Finishes a repair: the result drives the device (repaired → back to its
 * holder or stock; unrepairable / replaced → pending disposal).
 */
export function RepairCompleteDialog({
  repair,
  onClose,
}: {
  readonly repair: ItamRecord;
  readonly onClose: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const settings = useItamSettings();
  const [result, setResult] = useState<string>('repaired');
  // Where the device goes is chosen apart from what the repair achieved: a
  // device that could not be fixed may still be usable. Replaced defaults to
  // disposal, the rest to going back to where it came from.
  const [disposition, setDisposition] = useState<string>('return');
  const chooseResult = (next: string) => {
    setResult(next);
    setDisposition(next === 'replaced' ? 'dispose' : 'return');
  };
  // Amount with its currency; the record's currency, else the default one.
  const [cost, setCost] = useState<{ amount?: unknown; currency?: unknown }>({
    amount: null,
    currency: repair.currency ?? settings.data?.general.currency ?? null,
  });
  const [notes, setNotes] = useState('');
  const device = useItamRecord(DEVICES_PATH, text(repair.deviceId));
  const { label: returnLabel, relation } = useReturnLabel(device.data);
  const complete = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.request({
        path: `${REPAIRS_PATH}/${text(repair.id)}/complete`,
        method: 'POST',
        json: body,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['itam'] });
      onClose();
    },
  });
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('repairs.complete')}
      description={t('repairs.completeDescription')}
      busy={complete.isPending}
      error={complete.error}
      confirmLabel={t('repairs.complete')}
      onConfirm={() =>
        complete.mutate({
          result,
          disposition,
          cost: typeof cost.amount === 'number' ? cost.amount : undefined,
          currency:
            typeof cost.amount === 'number' && cost.currency
              ? text(cost.currency)
              : undefined,
          notes: notes || undefined,
        })
      }
    >
      <div className='grid gap-1.5'>
        <Label htmlFor='repair-result'>{t('fields.repairResult')}</Label>
        <FieldInput
          id='repair-result'
          field={{
            key: 'result',
            label: 'fields.repairResult',
            type: 'select',
            options: REPAIR_RESULTS.filter((r) => r !== 'inProgress').map(
              (value) => ({ value, label: `enums.repairResult.${value}` }),
            ),
          }}
          value={result}
          onChange={(value) => chooseResult(text(value))}
        />
      </div>
      <div className='grid gap-1.5'>
        <Label htmlFor='repair-disposition'>{t('repairs.disposition')}</Label>
        <Select
          items={REPAIR_DISPOSITIONS.map((value) => ({
            value,
            label:
              value === 'return'
                ? returnLabel
                : t(`repairs.dispositions.${value}`),
          }))}
          value={disposition}
          onValueChange={(next) => next && setDisposition(next)}
        >
          <SelectTrigger id='repair-disposition' className='w-full'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REPAIR_DISPOSITIONS.map((value) => (
              <SelectItem key={value} value={value}>
                {value === 'return'
                  ? returnLabel
                  : t(`repairs.dispositions.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {disposition === 'dispose' ? (
          <p className='text-xs text-muted-foreground'>
            {relation
              ? t('repairs.dispositions.disposeEnds', { relation })
              : t('repairs.dispositions.disposeHint')}
          </p>
        ) : null}
      </div>
      <div className='grid gap-1.5'>
        <Label htmlFor='repair-cost'>{t('fields.cost')}</Label>
        <FieldInput
          id='repair-cost'
          field={{
            key: 'cost',
            label: 'fields.cost',
            type: 'money',
            currencyField: 'currency',
          }}
          value={cost}
          onChange={(value) => setCost(value ?? {})}
        />
      </div>
      <div className='grid gap-1.5'>
        <Label htmlFor='repair-notes'>{t('repairs.resultNotes')}</Label>
        <Textarea
          id='repair-notes'
          rows={2}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>
    </ConfirmDialog>
  );
}

/**
 * The 完成维修 button for a device in repair: finds its open repair record
 * and offers to finish it. Renders nothing without an open record or the
 * permission.
 */
// eslint-disable-next-line react-refresh/only-export-components -- the hook and the button it renders belong together
export function useRepairComplete(
  deviceId: string | undefined,
  variant: 'default' | 'outline' = 'default',
  size?: 'sm' | 'default',
): { readonly button: ReactElement; readonly dialog: ReactNode } | undefined {
  const { t } = useTranslation();
  const permissions = useCollectionPermissions('repairs', ['complete']);
  const open = useItamList<ItamRecord>(
    REPAIRS_PATH,
    {
      filter: { deviceId: deviceId ?? '', result: 'inProgress' },
      sort: 'sentAt',
      order: 'desc',
      pageSize: 1,
    },
    { enabled: Boolean(deviceId) },
  );
  const [completing, setCompleting] = useState(false);
  const repair = open.data?.data[0];
  if (!deviceId || !permissions.complete || !repair) return undefined;
  return {
    button: (
      <Button
        key='repairDone'
        variant={variant}
        size={size}
        onClick={() => setCompleting(true)}
      >
        <CheckCheck data-icon='inline-start' />
        {t('repairs.complete')}
      </Button>
    ),
    dialog: completing ? (
      <RepairCompleteDialog
        repair={repair}
        onClose={() => setCompleting(false)}
      />
    ) : null,
  };
}

export function RepairCompleteButton({
  deviceId,
  variant = 'default',
  size,
}: {
  readonly deviceId: string;
  readonly variant?: 'default' | 'outline';
  readonly size?: 'sm' | 'default';
}): ReactElement | null {
  const complete = useRepairComplete(deviceId, variant, size);
  if (!complete) return null;
  return (
    <>
      {complete.button}
      {complete.dialog}
    </>
  );
}
