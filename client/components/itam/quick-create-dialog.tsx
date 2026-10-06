import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { RecordFormDialog } from '@/components/itam/record-form-dialog';
import { useItamMutations, type ItamRecord } from '@/lib/itam/api';
import type { FieldDefinition } from '@/lib/itam/fields';
import { masterDataByName } from '@/lib/itam/master-data';
import { referencePath } from '@/lib/itam/references';

/**
 * A master-data record created without leaving the form that needs it — a
 * model or a software product a purchase order line names but the books do
 * not hold yet. The fields are the collection's own, as on its page, so the
 * record is as complete as one created there; `narrow` may tighten a field
 * (a line's model must be of the line's kind). It opens over the dialog it
 * came from and hands the new record back.
 */
export function QuickCreateDialog({
  collection,
  open,
  onOpenChange,
  initial,
  narrow,
  onCreated,
}: {
  readonly collection: 'models' | 'softwareProducts';
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly initial?: Readonly<Record<string, unknown>>;
  readonly narrow?: (field: FieldDefinition) => FieldDefinition;
  readonly onCreated: (record: ItamRecord) => void;
}): ReactElement {
  const { t } = useTranslation();
  const meta = masterDataByName(collection)!;
  const mutations = useItamMutations(referencePath(collection));
  const fields = meta.fields
    .filter((field) => field.form !== false)
    .map((field) => (narrow ? narrow(field) : field));
  return (
    <RecordFormDialog
      // A fresh form for every opening, starting at what it was given.
      key={open ? JSON.stringify(initial ?? {}) : 'closed'}
      open={open}
      onOpenChange={(next) => {
        if (!next) mutations.create.reset();
        onOpenChange(next);
      }}
      title={t(`${meta.i18n}.new`)}
      fields={fields}
      initial={initial}
      submitting={mutations.create.isPending}
      error={mutations.create.error}
      onSubmit={async (values) => {
        const created = await mutations.create.mutateAsync(values);
        onCreated(created);
        onOpenChange(false);
      }}
    />
  );
}
