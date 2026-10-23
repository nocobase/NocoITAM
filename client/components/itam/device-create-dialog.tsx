import { useTranslation } from '@nocobase/i18n/client';
import { useRef, type ReactElement } from 'react';

import { RecordFormDialog } from '@/components/itam/record-form-dialog';
import {
  masterDataPath,
  useItamList,
  useItamMutations,
  type ItamRecord,
} from '@/lib/itam/api';
import { DEVICES_PATH } from '@/lib/itam/device-api';
import {
  ASSIGNEE_TYPES,
  DEVICE_CREATE_FIELDS,
  DEVICE_FIELDS,
  DEVICE_STATUS_OPTIONS,
} from '@/lib/itam/devices';
import type { FieldDefinition } from '@/lib/itam/fields';
import { addMonths, text } from '@/lib/itam/format';
import { useCurrentUserId } from '@/lib/itam/permissions';

/**
 * Where the new device starts (2026-10-16): on the shelf, in use by a
 * person, or on loan to one until a date; the person, and for a loan the
 * date, are then required. The other statuses need more (a repair order, a
 * disposal) and stay the device page's acts. None of these is a device
 * column: 使用中 is sent as `assignTo`, 借出 as `loanTo`, and the server
 * assigns or loans in the same step.
 */
const inUse = (values: Readonly<Record<string, unknown>>) =>
  values.startStatus === 'inUse';
const onLoan = (values: Readonly<Record<string, unknown>>) =>
  values.startStatus === 'onLoan';
/** 使用中 goes to a person, a place or another device; a loan to a person. */
const targetIs =
  (type: string) => (values: Readonly<Record<string, unknown>>) =>
    inUse(values) && values.startTargetType === type;

const START_FIELDS: readonly FieldDefinition[] = [
  {
    key: 'startStatus',
    label: 'fields.status',
    type: 'select',
    required: true,
    options: DEVICE_STATUS_OPTIONS.filter((option) =>
      ['inStock', 'inUse', 'onLoan'].includes(option.value),
    ),
    group: 'groups.basic',
  },
  {
    key: 'startTargetType',
    label: 'fields.assigneeType',
    type: 'select',
    options: ASSIGNEE_TYPES.map((value) => ({
      value,
      label: `enums.assigneeType.${value}`,
    })),
    visibleWhen: inUse,
    requiredWhen: inUse,
    group: 'groups.basic',
  },
  {
    key: 'assigneeId',
    label: 'devices.holding',
    // A loan's person borrows it rather than holds it.
    labelWhen: (values) =>
      onLoan(values) ? 'devices.startBorrower' : undefined,
    type: 'reference',
    reference: {
      collection: 'people',
      filter: { 'employmentStatus:ne': 'left' },
    },
    visibleWhen: (values) => targetIs('person')(values) || onLoan(values),
    requiredWhen: (values) => targetIs('person')(values) || onLoan(values),
    group: 'groups.basic',
  },
  {
    key: 'startLocationId',
    label: 'devices.holding',
    type: 'reference',
    reference: { collection: 'locations' },
    visibleWhen: targetIs('location'),
    requiredWhen: targetIs('location'),
    group: 'groups.basic',
  },
  {
    key: 'startDeviceId',
    label: 'devices.holding',
    type: 'reference',
    reference: { collection: 'devices' },
    visibleWhen: targetIs('device'),
    requiredWhen: targetIs('device'),
    group: 'groups.basic',
  },
  {
    key: 'startReturnDate',
    label: 'fields.expectedReturnDate',
    type: 'date',
    visibleWhen: onLoan,
    requiredWhen: onLoan,
    group: 'groups.basic',
  },
];

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
  locked,
  onCreated,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Values the form opens with, the signed-in user as owner beneath them. */
  readonly initial?: Readonly<Record<string, unknown>>;
  /**
   * Fields the form shows but does not let be changed, each with the
   * translation key of why: 补登记's serial (2026-10-16), which is what links
   * the new device to its platform record once saved.
   */
  readonly locked?: Readonly<Record<string, string>>;
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
  // The category's warranty stands in when the model states none, as it
  // does on the server (2026-10-23); the same tree the path reads, cached.
  const categories = useItamList<ItamRecord>(masterDataPath('categories'), {
    pageSize: 500,
  });
  return (
    <RecordFormDialog
      key={open ? 'create' : 'closed'}
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) mutations.create.reset();
      }}
      title={t('devices.new')}
      fields={DEVICE_CREATE_FIELDS.flatMap((key) => {
        const field = DEVICE_FIELDS.find((entry) => entry.key === key)!;
        const hint = locked?.[key];
        const shown = hint
          ? { ...field, readonlyWhen: () => true, readonlyHint: hint }
          : field;
        // Where it starts, right after its name — the status and what it
        // asks for — then its 负责人 (2026-10-16).
        if (key === 'ownerId') return [];
        if (key !== 'name') return [shown];
        const owner = DEVICE_FIELDS.find((entry) => entry.key === 'ownerId')!;
        return [shown, ...START_FIELDS, owner];
      })}
      initial={{
        ...(currentUserId ? { ownerId: currentUserId } : {}),
        startStatus: 'inStock',
        startTargetType: 'person',
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
        // Warranty end = purchase date + the model's warranty months, else
        // its category's, shown as soon as both are known; a date typed by
        // hand stays.
        const purchaseDate = text(
          change.key === 'purchaseDate' ? change.value : values.purchaseDate,
        );
        const model = derivedModelRef.current;
        const category = categories.data?.data.find(
          (entry) => entry.id === model?.categoryId,
        );
        const months = Number(
          model?.warrantyMonths ?? category?.warrantyMonths ?? 0,
        );
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
      onSubmit={async ({
        startStatus,
        startTargetType,
        assigneeId,
        startLocationId,
        startDeviceId,
        startReturnDate,
        ...values
      }) => {
        const targetId =
          startStatus === 'onLoan' || startTargetType === 'person'
            ? assigneeId
            : startTargetType === 'location'
              ? startLocationId
              : startDeviceId;
        const created = await mutations.create.mutateAsync({
          ...values,
          ...(startStatus === 'inUse' && targetId
            ? { assignTo: { targetType: startTargetType, targetId } }
            : startStatus === 'onLoan' && targetId
              ? {
                  loanTo: {
                    targetType: 'person',
                    targetId,
                    expectedReturnDate: startReturnDate,
                  },
                }
              : {}),
        });
        onOpenChange(false);
        await onCreated(created);
      }}
    />
  );
}
