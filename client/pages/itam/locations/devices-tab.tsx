import type { ReactElement } from 'react';
import { useParams } from 'react-router';

import { DeviceListEmbed } from '@/components/itam/device-list-embed';
import { useSubtree } from '@/lib/itam/tree';

/**
 * A location's devices, its sub-locations' included (2026-10-21), with each
 * one's location, on a leaf too.
 */
export default function LocationDevicesTab(): ReactElement | null {
  const { id = '' } = useParams();
  const ids = useSubtree('locations', id);
  if (!ids) return null;
  return (
    <DeviceListEmbed
      filter={{ locationId: ids }}
      // Who holds each matters more here than since when (2026-10-21).
      omit={['assignedAt']}
      show={['noAndName', 'location', 'serialNo', 'assignee']}
    />
  );
}
