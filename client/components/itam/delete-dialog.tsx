import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement, ReactNode } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import type { DeleteImpact } from '@/lib/itam/api';

export interface DeleteDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Object name, e.g. "manufacturer". */
  readonly objectLabel: string;
  /** Record display name, shown in the title. */
  readonly recordName: string;
  readonly impact: DeleteImpact | undefined;
  readonly loadingImpact?: boolean;
  readonly deleting?: boolean;
  readonly error?: string;
  readonly onConfirm: () => void;
  /** Translates a referencing collection name for the blocked list. */
  readonly collectionLabel: (collection: string) => ReactNode;
}

/** The three-tier delete confirmation: blocked, warned, or plain. */
export function DeleteDialog({
  open,
  onOpenChange,
  objectLabel,
  recordName,
  impact,
  loadingImpact,
  deleting,
  error,
  onConfirm,
  collectionLabel,
}: DeleteDialogProps): ReactElement {
  const { t } = useTranslation();
  const blocked = impact?.level === 'blocked';
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => (!deleting ? onOpenChange(next) : undefined)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('delete.title', { object: objectLabel, name: recordName })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {loadingImpact ? (
              <Skeleton className='h-4 w-2/3' />
            ) : blocked ? (
              t('delete.blocked')
            ) : impact?.parts?.length ? (
              // Root deleting past the business rules (2026-10-30): what
              // goes with the record is listed below.
              t('delete.withParts')
            ) : impact?.level === 'warn' ? (
              t('delete.warned')
            ) : (
              t('delete.plain', { object: objectLabel })
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {impact && impact.references.length > 0 ? (
          <ul className='list-disc space-y-1 pl-5 text-sm'>
            {impact.references.map((reference) => (
              <li key={`${reference.collection}.${reference.field}`}>
                {t('delete.reference', {
                  count: reference.count,
                  collection: collectionLabel(reference.collection) as string,
                })}
              </li>
            ))}
          </ul>
        ) : null}
        {!blocked && impact?.parts?.length ? (
          <ul className='list-disc space-y-1 pl-5 text-sm'>
            {impact.parts.map((part) => (
              <li key={`${part.collection}.${part.field}`}>
                {t('delete.part', {
                  count: part.count,
                  collection: collectionLabel(part.collection) as string,
                })}
              </li>
            ))}
          </ul>
        ) : null}
        {error ? <p className='text-sm text-destructive'>{error}</p> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>
            {t('actions.cancel')}
          </AlertDialogCancel>
          {!blocked ? (
            <AlertDialogAction
              variant='destructive'
              disabled={deleting || loadingImpact}
              onClick={(event) => {
                event.preventDefault();
                onConfirm();
              }}
            >
              {t('actions.delete')}
            </AlertDialogAction>
          ) : null}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
