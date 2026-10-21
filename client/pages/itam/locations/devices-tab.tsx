import type { ReactElement } from 'react';
import { useParams } from 'react-router';

import { DeviceListEmbed } from '@/components/itam/device-list-embed';

export default function LocationDevicesTab(): ReactElement {
  const { id = '' } = useParams();
  return (
    <DeviceListEmbed
      filter={{ locationId: id }}
      // Who holds each matters more here than since when (2026-10-21).
      omit={['assignedAt']}
      show={['noAndName', 'serialNo', 'assignee']}
    />
  );
}
