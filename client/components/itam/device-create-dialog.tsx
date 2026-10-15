import { useTranslation } from '@nocobase/i18n/client';
import { useRef, type ReactElement } from 'react';

import { RecordFormDialog } from '@/components/itam/record-form-dialog';
import { useItamMutations, type ItamRecord } from '@/lib/itam/api';
import { DEVICES_PATH } from '@/lib/itam/device-api';
import { DEVICE_CREATE_FIELDS, DEVICE_FIELDS } from '@/lib/itam/devices';
import { addMonths, text } from '@/lib/itam/format';
import { useCurrentUserId } from '@/lib/itam/permissions';

/**
 * 创建设备, wherever a device is put on the register: the device list, and
 * 补登记 on MDM 核对 (2026-10-15), which opens it in place filled with what
 * the platform knows rather than sending the reader to the list. The model
 * brings its category and maker (read-only) and names the device until the
 * reader types a name; the warranty end follows the purchase date and the
 * model's warranty until it is typed by hand.
 */
export function DeviceCreateDialog({
  open,
  onOpenChange,
  initial,
  onCreated,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Values the form opens with, the signed-in user as owner beneath them. */
  readonly initial?: Readonly<Record<string, unknown>>;
  readonly onCreated: (created: ItamRecord) => void | Promise<void>;
}): ReactElement {
  const { t } = useTranslation();
  const mutations = useItamMutations<ItamRecord>(DEVICES_PATH);
  const currentUserId = useCurrentUserId();
  const derivedNameRef = useRef('');
  // The model chosen and the warranty end it implied, so a changed purchase
  // date recomputes a date the user never touched.
  const derivedModelRef = useRef<ItamRecord | undefined>(undefined);
  const derivedWarrantyRef = useRef('');
  return (
    <RecordFormDialog
      key={open ? 'create' : 'closed'}
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) mutations.create.reset();
      }}
      title={t('devices.new')}
      fields={DEVICE_CREATE_FIELDS.map((key) =>
        DEVICE_FIELDS.find((field) => field.key === key)!,
      )}
      initial={{
        ...(currentUserId ? { ownerId: currentUserId } : {}),
        ...initial,
      }}
      derive={(change, values) => {
        if (change.key !== 'modelId' && change.key !== 'purchaseDate')
          return undefined;
        const next: Record<string, unknown> = {};
        if (change.key === 'modelId') {
          derivedModelRef.current = change.record;
          // Category and manufacturer follow the model, read-only.
          next.categoryId = change.record?.categoryId ?? null;
          next.manufacturerId = change.record?.manufacturerId ?? null;
          // The name defaults to the model name and follows the model
          // until the user types a name of their own.
          const current = text(values.name);
          if (!current || current === derivedNameRef.current) {
            derivedNameRef.current = change.record
              ? text(change.record.name)
              : '';
            next.name = derivedNameRef.current || null;
          }
        }
        // Warranty end = purchase date + the model's warranty months, shown
        // as soon as both are known; a date typed by hand stays (the server
        // also fills the category default when the model has none).
        const purchaseDate = text(
          change.key === 'purchaseDate' ? change.value : values.purchaseDate,
        );
        const months = Number(derivedModelRef.current?.warrantyMonths ?? 0);
        const warranty = text(values.warrantyEndDate);
        if (!warranty || warranty === derivedWarrantyRef.current) {
          derivedWarrantyRef.current =
            purchaseDate && months > 0 ? addMonths(purchaseDate, months) : '';
          next.warrantyEndDate = derivedWarrantyRef.current || null;
        }
        return next;
      }}
      submitting={mutations.create.isPending}
      error={mutations.create.error}
      onSubmit={async (values) => {
        const created = await mutations.create.mutateAsync(values);
        onOpenChange(false);
        await onCreated(created);
      }}
    />
  );
}
