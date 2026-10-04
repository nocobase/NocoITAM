import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { ConfirmDialog } from '@/components/itam/confirm-dialog';
import { ReferenceSelect } from '@/components/itam/reference-select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RETURN_TARGETS } from '@/lib/itam/devices';

/**
 * Taking a device back: where it goes (`inStock` by default), the place it
 * goes back to and the shape it came back in.
 *
 * It lives here rather than on the device page because a leaver's recovery
 * returns devices from the person's own page, and a second dialog asking the
 * same three questions would answer them differently the first time one of
 * them changed.
 */
export function DeviceReturnDialog({
  currentLocationId,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  readonly currentLocationId: string | null;
  readonly busy: boolean;
  readonly error: unknown;
  readonly onClose: () => void;
  readonly onConfirm: (body: Record<string, unknown>) => void;
}): ReactElement {
  const { t } = useTranslation();
  const [nextStatus, setNextStatus] = useState<string>('inStock');
  // Where it goes back to; starts from where it is now.
  const [locationId, setLocationId] = useState<string | null>(
    currentLocationId,
  );
  const [condition, setCondition] = useState('');
  const items = RETURN_TARGETS.map((value) => ({
    value,
    label: t(`enums.deviceStatus.${value}`),
  }));
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('deviceActions.return.title')}
      description={t('deviceActions.return.descriptionOne')}
      busy={busy}
      error={error}
      confirmLabel={t('deviceActions.return.confirm')}
      onConfirm={() =>
        onConfirm({
          nextStatus,
          locationId: locationId ?? undefined,
          condition: condition || undefined,
        })
      }
    >
      <div className='grid gap-1.5'>
        <Label htmlFor='return-status'>
          {t('deviceActions.return.nextStatus')}
        </Label>
        <Select
          items={items}
          value={nextStatus}
          onValueChange={(value) => setNextStatus(String(value))}
        >
          <SelectTrigger id='return-status' className='w-full'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className='grid gap-1.5'>
        <Label htmlFor='return-location'>{t('fields.location')}</Label>
        <ReferenceSelect
          id='return-location'
          reference={{ collection: 'locations' }}
          value={locationId}
          onChange={setLocationId}
        />
      </div>
      <div className='grid gap-1.5'>
        <Label htmlFor='return-condition'>
          {t('deviceActions.return.condition')}
        </Label>
        <Input
          id='return-condition'
          value={condition}
          onChange={(event) => setCondition(event.target.value)}
        />
      </div>
    </ConfirmDialog>
  );
}
