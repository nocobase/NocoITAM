import type { ReactElement } from 'react';

import { MasterCreateDialog } from '@/components/itam/master-create-dialog';
import type { ItamRecord } from '@/lib/itam/api';
import type { FieldDefinition } from '@/lib/itam/fields';

/**
 * A master-data record created without leaving the form that needs it — a
 * model or a software product a purchase order line names but the books do
 * not hold yet. It is the collection's own create dialog, AI 整理 included,
 * so the record is as complete as one created on its page; `narrow` may
 * tighten a field (a line's model must be of the line's kind). It opens over
 * the dialog it came from and hands the new record back.
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
  return (
    <MasterCreateDialog
      collection={collection}
      open={open}
      onOpenChange={onOpenChange}
      initial={initial}
      narrow={narrow}
      onCreated={onCreated}
    />
  );
}
