import { useTranslation } from '@nocobase/i18n/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Fragment, useState, type ReactElement } from 'react';

import { ApproverHint } from '@/components/itam/approver-hint';
import { ConfirmDialog } from '@/components/itam/confirm-dialog';
import { FieldInput } from '@/components/itam/field-input';
import { FieldLabel } from '@/components/itam/field-label';
import { ReviewMark } from '@/components/itam/review-mark';
import { ReferenceSelect } from '@/components/itam/reference-select';
import { MultiReferenceInput } from '@/components/itam/multi-reference';
import { Label } from '@/components/ui/label';
import { useApi, useItamList, type ItamRecord } from '@/lib/itam/api';
import { DEVICES_PATH } from '@/lib/itam/device-api';
import { text, todayIso } from '@/lib/itam/format';
import { cn } from '@/lib/utils';
import { useCurrentUserId } from '@/lib/itam/permissions';
import { DisposalTriage } from './triage.js';
import { resolveFormField, type FieldDefinition } from '@/lib/itam/fields';
import {
  DISPOSAL_CREATE_FIELDS,
  DISPOSAL_FIELDS,
  DISPOSALS_PATH,
} from '@/lib/itam/operations';

const HEADER_FIELDS = DISPOSAL_CREATE_FIELDS.map((key) =>
  DISPOSAL_FIELDS.find((field) => field.key === key)!,
);

/**
 * A disposal in one go: its header, the devices it lists and whether it is
 * saved as a draft or submitted for approval right away. The list page
 * starts empty; a device page starts with that device.
 */
export function DisposalCreateDialog({
  open,
  onOpenChange,
  onCreated,
  deviceIds: initialDeviceIds = [],
  initial,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCreated: (record: ItamRecord) => void;
  readonly deviceIds?: readonly string[];
  /**
   * What the request starts with (2026-10-20): a repair Asset Steward
   * advised against becomes a disposal for the reason and fault it gave.
   */
  readonly initial?: {
    readonly reason?: string;
    readonly description?: string;
  };
}): ReactElement {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, unknown>>(() => ({
    requestedAt: todayIso(),
    ...initial,
  }));
  const [deviceIds, setDeviceIds] =
    useState<readonly string[]>(initialDeviceIds);
  const fixedDevices = initialDeviceIds.length > 0;
  // What 报废诊断 filled and nobody has changed since: 请核对.
  const [marks, setMarks] = useState<ReadonlySet<string>>(() => new Set());
  // Needed to submit right away, not to save a draft.
  const [approverId, setApproverId] = useState<string | null>(null);
  const currentUserId = useCurrentUserId();
  // 返还租赁方 goes back to whoever lent them (2026-10-20): the devices'
  // lender, when they share one, fills an empty recipient once.
  const returning = values.method === 'returnToLessor';
  const lent = useItamList<ItamRecord>(
    DEVICES_PATH,
    { ids: deviceIds, pageSize: Math.max(deviceIds.length, 1) },
    { enabled: returning && deviceIds.length > 0 },
  );
  const lenders = new Set(
    (lent.data?.data ?? []).map((row) => text(row.lenderVendorId)),
  );
  const lender = lenders.size === 1 ? [...lenders][0] || undefined : undefined;
  const [lenderFilled, setLenderFilled] = useState(false);
  if (
    returning &&
    lender &&
    !lenderFilled &&
    !values.recipientVendorId &&
    !text(values.recipientName).trim()
  ) {
    setLenderFilled(true);
    setValues((current) => ({ ...current, recipientVendorId: lender }));
  }
  // Whoever is filing it is its 负责人 until they name someone else. The
  // signed-in id arrives after the first render, so it is read here rather
  // than stored: untouched means the filer, and clearing the field means
  // empty — which the required check then refuses.
  const valueOf = (key: string): unknown =>
    key === 'ownerId' && !(key in values) ? currentUserId : values[key];
  const create = useMutation({
    mutationFn: async (submit: boolean) => {
      const created = (
        await api.request<{ data: ItamRecord }>({
          path: DISPOSALS_PATH,
          method: 'POST',
          json: {
            ...values,
            // A lost device goes to nobody (2026-10-20): a recipient typed
            // before the method changed is not sent.
            ...(values.method === 'lossWriteOff'
              ? { recipientVendorId: null, recipientName: null }
              : {}),
            ownerId: valueOf('ownerId'),
            deviceIds,
          },
        })
      ).data;
      if (submit)
        await api.request({
          path: `${DISPOSALS_PATH}/${text(created.id)}/submit`,
          method: 'POST',
          json: { approverId },
        });
      return created;
    },
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['itam'] });
      onCreated(created);
    },
  });
  // What the form asks for right now: the cascading rules decide what is
  // shown and what is required, and a resolved `required` also keeps an
  // empty choice out of a select (清除方式 once something was wiped).
  const shownFields = HEADER_FIELDS.map((field) =>
    resolveFormField(field, values),
  ).filter(
    // `form: false` is the other half of a pair edited together (the
    // recipient typed in), never a field of its own (2026-10-16).
    (field) =>
      field.form !== false && (!field.visibleWhen || field.visibleWhen(values)),
  );
  // A field that edits two halves at once passes and takes the pair.
  const pairValue = (field: FieldDefinition): unknown =>
    field.alternateField
      ? {
          vendorId: values[field.key] ?? null,
          name: values[field.alternateField] ?? '',
        }
      : field.dependent
        ? {
            value: valueOf(field.key),
            dependent: values[field.dependent.key] ?? null,
          }
        : valueOf(field.key);
  const splitPair = (
    field: FieldDefinition,
    value: unknown,
  ): Record<string, unknown> => {
    const pair = (value ?? {}) as Record<string, unknown>;
    if (field.alternateField)
      return {
        [field.key]: pair.vendorId ?? null,
        [field.alternateField]: pair.name || null,
      };
    if (field.dependent)
      return {
        [field.key]: pair.value ?? null,
        [field.dependent.key]: pair.dependent ?? null,
      };
    return { [field.key]: value };
  };
  // A pair is answered by either half: a vendor or a typed name.
  const complete =
    shownFields.every(
      (field) =>
        !field.required ||
        Boolean(valueOf(field.key)) ||
        Boolean(
          field.alternateField && text(valueOf(field.alternateField)).trim(),
        ),
    ) && deviceIds.length > 0;
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) create.reset();
        onOpenChange(next);
      }}
      title={t('disposals.new')}
      description={t('disposals.newDescription')}
      busy={create.isPending}
      error={create.error}
      disabled={!complete}
      confirmDisabled={!approverId}
      confirmLabel={t('disposals.submit')}
      onConfirm={() => create.mutate(true)}
      secondaryLabel={t('procurement.saveDraft')}
      onSecondary={() => create.mutate(false)}
      size='form'
    >
      {/* Two fields to a row (2026-10-16); the devices and a long text
          take the whole row. */}
      <div className='grid gap-4 sm:grid-cols-2'>
        {/* What is disposed of leads the request (2026-10-20), as a
            repair's device does. Opened for a device — from its page, or a
            repair turned into a disposal — it is that device alone, fixed;
            several are put together from the disposals list. */}
        <div className='grid gap-1.5 sm:col-span-2'>
          <Label htmlFor='disposal-devices'>
            <FieldLabel
              label={t('disposals.devices')}
              hint={fixedDevices ? 'disposals.devicesFixed' : undefined}
            >
              <span className='text-destructive'>*</span>
            </FieldLabel>
          </Label>
          {fixedDevices ? (
            // The one device, as a repair's is: the select it would be
            // chosen in, fixed.
            <ReferenceSelect
              id='disposal-devices'
              reference={{ collection: 'devices' }}
              value={deviceIds[0] ?? null}
              onChange={() => undefined}
              disabled
            />
          ) : (
            <MultiReferenceInput
              id='disposal-devices'
              reference={{ collection: 'devices' }}
              value={deviceIds}
              onChange={setDeviceIds}
            />
          )}
        </div>
        {shownFields.map((field) => (
          <Fragment key={field.key}>
            <div
              className={cn(
                'grid content-start gap-1.5',
                (field.type === 'textarea' || field.wide) && 'sm:col-span-2',
              )}
            >
              <Label htmlFor={`disposal-${field.key}`}>
                {t(field.label)}
                {field.required ? (
                  <span className='text-destructive'> *</span>
                ) : null}
                {marks.has(field.key) ? <ReviewMark /> : null}
              </Label>
              <FieldInput
                id={`disposal-${field.key}`}
                field={field}
                value={pairValue(field)}
                onChange={(value) => {
                  setValues((current) => ({
                    ...current,
                    ...splitPair(field, value),
                  }));
                  // Changed by the person, it is theirs to stand by.
                  if (marks.has(field.key))
                    setMarks(
                      (before) =>
                        new Set([...before].filter((key) => key !== field.key)),
                    );
                }}
              />
            </div>
            {/* 诊断 right under the description it reads (2026-10-20), as
                a repair's is under its fault. */}
            {field.key === 'description' ? (
              <div className='sm:col-span-2'>
                <DisposalTriage
                  deviceIds={deviceIds}
                  description={text(values.description)}
                  onDescription={(next) =>
                    setValues((current) => ({ ...current, description: next }))
                  }
                  onReading={(reading) => {
                    // Only what is still empty: the person's choices stand.
                    const filled = (
                      ['reason', 'method', 'dataWipe'] as const
                    ).filter((key) => reading[key] && !values[key]);
                    setValues((current) => ({
                      ...current,
                      ...Object.fromEntries(
                        filled.map((key) => [key, reading[key]]),
                      ),
                    }));
                    setMarks((before) => new Set([...before, ...filled]));
                  }}
                />
              </div>
            ) : null}
          </Fragment>
        ))}
        <div className='grid content-start gap-1.5'>
          <Label htmlFor='disposal-create-approver'>
            {t('procurement.approver')}
          </Label>
          <ReferenceSelect
            id='disposal-create-approver'
            reference={{
              collection: 'approvers',
              filter: { subject: 'disposal' },
            }}
            value={approverId}
            onChange={setApproverId}
          />
          <ApproverHint
            subject='disposal'
            hint={t('disposals.approverForSubmit')}
          />
        </div>
      </div>
    </ConfirmDialog>
  );
}
