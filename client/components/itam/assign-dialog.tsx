import { useTranslation } from '@nocobase/i18n/client';
import { BookmarkX } from 'lucide-react';
import { useState, type FormEvent, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  apiErrorBody,
  masterDataPath,
  useItamRecord,
  type ItamRecord,
} from '@/lib/itam/api';
import { DEVICES_PATH } from '@/lib/itam/device-api';
import { ASSIGNEE_TYPES, type AssigneeType } from '@/lib/itam/devices';
import {
  defaultLoanReturnDate,
  deviceLabel,
  errorMessage,
  formatDate,
  text,
  todayIso,
} from '@/lib/itam/format';

import { ReferenceSelect } from './reference-select.js';

export interface AssignValues {
  readonly targetType: AssigneeType;
  readonly targetId: string;
  /** Where the device will be; proposed from the target, confirmed here. */
  readonly locationId?: string;
  readonly expectedReturnDate?: string;
}

export interface AssignDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly mode: 'assign' | 'loan' | 'transfer';
  /** How many devices the dialog applies to; shown in the description. */
  readonly count?: number;
  readonly excludeDeviceId?: string;
  /** Whom the dialog starts on, e.g. the target a device is reserved for. */
  readonly initialTarget?: { type: AssigneeType; id: string };
  /**
   * A reservation the device carries: the dialog shows it instead of a
   * target picker (an assignment can only go to the reserved target and a
   * loan not at all) and offers to cancel it, which `onUnlock` does; once
   * the reservation is gone the picker appears.
   */
  readonly lockedTarget?: {
    type: AssigneeType;
    id: string;
    until?: unknown;
  };
  readonly onUnlock?: () => Promise<void> | void;
  readonly submitting?: boolean;
  readonly error?: unknown;
  readonly onSubmit: (values: AssignValues) => Promise<void> | void;
}

/** Assign / loan / transfer: pick a person, location or device as the target. */
export function AssignDialog({
  open,
  onOpenChange,
  mode,
  count = 1,
  excludeDeviceId,
  initialTarget,
  lockedTarget,
  onUnlock,
  submitting,
  error,
  onSubmit,
}: AssignDialogProps): ReactElement {
  const { t } = useTranslation();
  const [targetType, setTargetType] = useState<AssigneeType>(
    initialTarget?.type ?? 'person',
  );
  const [targetId, setTargetId] = useState<string | null>(
    initialTarget?.id ?? null,
  );
  // The chosen target proposes the device's location: a person's office,
  // the location itself, a holding device's location. The user's own pick
  // is remembered per target, so changing the target proposes afresh.
  const target = useItamRecord<ItamRecord>(
    targetType === 'device'
      ? DEVICES_PATH
      : masterDataPath(targetType === 'person' ? 'people' : 'locations'),
    targetId ?? undefined,
  );
  const [pickedLocation, setPickedLocation] = useState<{
    targetId: string;
    locationId: string | null;
  }>();
  const proposedLocation =
    targetType === 'location'
      ? targetId
      : target.data && target.data.id === targetId
        ? typeof target.data.locationId === 'string'
          ? target.data.locationId
          : null
        : null;
  const locationId =
    pickedLocation && pickedLocation.targetId === targetId
      ? pickedLocation.locationId
      : proposedLocation;
  // A loan is due back in two weeks unless said otherwise.
  const [expectedReturnDate, setExpectedReturnDate] = useState(
    defaultLoanReturnDate,
  );
  const body = apiErrorBody(error);
  const message = error ? (body?.message ?? errorMessage(error)) : undefined;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!targetId) return;
    await onSubmit({
      targetType,
      targetId,
      locationId: locationId ?? undefined,
      expectedReturnDate: mode === 'loan' ? expectedReturnDate : undefined,
    });
  };

  const types = mode === 'loan' ? (['person'] as const) : ASSIGNEE_TYPES;
  // While reserved, the picker is replaced by the reservation itself.
  const locked = Boolean(lockedTarget);
  const lockedLabel = target.data
    ? lockedTarget?.type === 'device'
      ? deviceLabel(target.data)
      : text(target.data.name)
    : '…';

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (!submitting ? onOpenChange(next) : undefined)}
    >
      <DialogContent className='sm:max-w-lg'>
        <form onSubmit={(event) => void submit(event)} className='space-y-4'>
          <DialogHeader>
            <DialogTitle>{t(`deviceActions.${mode}.title`)}</DialogTitle>
            <DialogDescription>
              {count === 1
                ? t(`deviceActions.${mode}.descriptionOne`, {
                    defaultValue: t(`deviceActions.${mode}.description`),
                  })
                : t(`deviceActions.${mode}.description`, { count })}
            </DialogDescription>
          </DialogHeader>
          {locked ? (
            <div className='space-y-2 rounded-lg border border-border bg-muted/40 p-3 text-sm'>
              <p>
                {t('deviceActions.reserved.notice', {
                  holder: lockedLabel,
                  date: formatDate(lockedTarget?.until) || '—',
                })}
              </p>
              <p className='text-muted-foreground'>
                {t(
                  `deviceActions.reserved.${mode === 'loan' ? 'loanHint' : 'assignHint'}`,
                )}
              </p>
              {onUnlock ? (
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  disabled={submitting}
                  onClick={() => void onUnlock()}
                >
                  <BookmarkX data-icon='inline-start' />
                  {t('deviceActions.unreserve.title')}
                </Button>
              ) : null}
            </div>
          ) : null}
          {!locked && types.length > 1 ? (
            <Tabs
              value={targetType}
              onValueChange={(value) => {
                setTargetType(value as AssigneeType);
                setTargetId(null);
              }}
            >
              <TabsList>
                {types.map((type) => (
                  <TabsTrigger key={type} value={type}>
                    {t(`enums.assigneeType.${type}`)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          ) : null}
          {locked ? null : (
            <div className='grid gap-1.5'>
              <Label htmlFor='assign-target'>
                {t(`enums.assigneeType.${targetType}`)}
              </Label>
              <ReferenceSelect
                id='assign-target'
                reference={{
                  collection:
                    targetType === 'person'
                      ? 'people'
                      : targetType === 'location'
                        ? 'locations'
                        : 'devices',
                  ...(targetType === 'person'
                    ? { filter: { employmentStatus: 'active' } }
                    : {}),
                }}
                value={targetId}
                onChange={setTargetId}
                excludeId={excludeDeviceId}
                disabled={submitting}
              />
            </div>
          )}
          {targetId && !(locked && mode === 'loan') ? (
            <div className='grid gap-1.5'>
              <Label htmlFor='assign-location'>{t('fields.location')}</Label>
              <ReferenceSelect
                id='assign-location'
                reference={{ collection: 'locations' }}
                value={locationId}
                onChange={(value) =>
                  targetId && setPickedLocation({ targetId, locationId: value })
                }
                disabled={submitting}
              />
              <p className='text-xs text-muted-foreground'>
                {t('deviceActions.assign.locationHint')}
              </p>
            </div>
          ) : null}
          <div className='grid gap-4 sm:grid-cols-2'>
            {mode === 'loan' ? (
              <div className='grid gap-1.5'>
                <Label htmlFor='assign-return'>
                  {t('fields.expectedReturnDate')}{' '}
                  <span className='text-destructive'>*</span>
                </Label>
                <Input
                  id='assign-return'
                  type='date'
                  max='9999-12-31'
                  min={todayIso()}
                  required
                  value={expectedReturnDate}
                  onChange={(event) =>
                    setExpectedReturnDate(event.target.value)
                  }
                />
              </div>
            ) : null}
          </div>
          {message ? (
            <p className='text-sm text-destructive'>{message}</p>
          ) : null}
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              disabled={submitting}
              onClick={() => onOpenChange(false)}
            >
              {t('actions.cancel')}
            </Button>
            <Button
              type='submit'
              disabled={
                submitting ||
                !targetId ||
                (locked && mode === 'loan') ||
                (mode === 'loan' && !expectedReturnDate)
              }
            >
              {t(`deviceActions.${mode}.confirm`)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
