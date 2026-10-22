import { useTranslation } from '@nocobase/i18n/client';
import { MapPin, MonitorSmartphone, User } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import { FieldValue } from '@/components/itam/cells';
import type { ItamRecord } from '@/lib/itam/api';
import { holderCollection } from '@/lib/itam/devices';
import { formatDate, text } from '@/lib/itam/format';
import { useReferenceNames, type ReferenceNames } from '@/lib/itam/references';

import { TreePath } from './tree-path.js';

/** The kind of holder a device is with: a person, a place or another device. */
export function HolderIcon({ type }: { readonly type: string }): ReactElement {
  const className = 'size-3.5 text-muted-foreground';
  if (type === 'person') return <User className={className} />;
  if (type === 'location') return <MapPin className={className} />;
  return <MonitorSmartphone className={className} />;
}

/**
 * Who a device is with: the holder (or the reservation) as a link with its
 * icon and date, or the `unassigned` fallback when it is with nobody.
 */
export function DeviceRelation({
  device,
  unassigned,
  names: prefetched,
  locationShow = 'path',
  dates = true,
}: {
  readonly device: ItamRecord;
  readonly unassigned?: ReactNode;
  /** Holder names a list already loaded for its rows; skips the lookup. */
  readonly names?: Record<string, ReferenceNames>;
  /** A location holder reads as its path, its own name or its top-level site. */
  readonly locationShow?: 'path' | 'leaf' | 'root';
  /** `false` leaves out the assignment, return or reservation date. */
  readonly dates?: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const status = text(device.status);
  const type = device.assigneeId
    ? text(device.assigneeType)
    : text(device.reservedForType);
  const id = device.assigneeId ?? device.reservedForId;
  const collection = holderCollection(type);
  const own = useReferenceNames(
    prefetched ? [] : [{ collection, ids: [id ? text(id) : null] }],
  );
  const names = prefetched ?? own;
  if (!id)
    return (
      <>
        {unassigned ?? (
          <span className='text-muted-foreground'>
            {t('devices.unassigned')}
          </span>
        )}
      </>
    );
  const suffix = !dates
    ? ''
    : device.assigneeId
      ? status === 'onLoan' && device.expectedReturnDate
        ? t('devices.returnExpected', {
            date: formatDate(device.expectedReturnDate),
          })
        : device.assignedAt
          ? t('devices.assignedSince', { date: formatDate(device.assignedAt) })
          : ''
      : t('devices.reservedUntilSuffix', {
          date: formatDate(device.reservedUntil),
        });
  return (
    // Text flow, not a wrapping flex row (2026-10-22): as a row of its own
    // the date dropped to the next line comma first; as text, Chinese line
    // breaking keeps the comma with the holder.
    <span className='whitespace-normal'>
      <span className='mr-1 inline-flex align-[-2px]'>
        <HolderIcon type={type} />
      </span>
      {collection === 'locations' ? (
        <TreePath collection={collection} nodeId={id} show={locationShow} />
      ) : (
        <FieldValue
          field={{
            key: 'assignee',
            label: 'fields.assignee',
            type: 'reference',
            reference: { collection },
          }}
          value={id}
          names={names}
        />
      )}
      {suffix ? <span className='text-muted-foreground'>{suffix}</span> : null}
    </span>
  );
}
