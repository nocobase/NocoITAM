import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { RecordFormDialog } from '@/components/itam/record-form-dialog';
import {
  useItamMutations,
  useItamRecord,
  type ItamRecord,
} from '@/lib/itam/api';
import { DEVICES_PATH } from '@/lib/itam/device-api';
import { todayIso } from '@/lib/itam/format';
import { useCurrentUserId } from '@/lib/itam/permissions';
import {
  REPAIR_CREATE_FIELDS,
  REPAIR_FIELDS,
  REPAIRS_PATH,
} from '@/lib/itam/operations';

const CREATE_FIELDS = REPAIR_CREATE_FIELDS.map((key) =>
  REPAIR_FIELDS.find((field) => field.key === key)!,
);

/**
 * A new repair for one device: the sending side only (method, vendor, fault,
 * dates); cost and notes come with completion.
 */
export function RepairCreateDialog({
  deviceId,
  open,
  onOpenChange,
}: {
  readonly deviceId: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}): ReactElement {
  const { t } = useTranslation();
  const device = useItamRecord(DEVICES_PATH, deviceId);
  const mutations = useItamMutations<ItamRecord>(REPAIRS_PATH);
  const currentUserId = useCurrentUserId();
  return (
    <RecordFormDialog
      key={open ? 'create' : 'closed'}
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) mutations.create.reset();
      }}
      title={t('repairs.new')}
      fields={CREATE_FIELDS}
      // Whoever files it follows it through until they name someone else.
      initial={{
        sentAt: todayIso(),
        ...(currentUserId ? { ownerId: currentUserId } : {}),
      }}
      // The vendor follows the method: the device's own vendor once a
      // warranty or send-out repair is chosen, none for an internal one.
      derive={({ key, value }, values) =>
        key === 'method'
          ? {
              vendorId:
                value === 'internal'
                  ? null
                  : (values.vendorId ?? device.data?.vendorId ?? null),
            }
          : undefined
      }
      submitting={mutations.create.isPending}
      error={mutations.create.error}
      onSubmit={async (values) => {
        await mutations.create.mutateAsync({ ...values, deviceId });
        onOpenChange(false);
      }}
    />
  );
}
