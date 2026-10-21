import type { ReactElement } from 'react';
import { useParams } from 'react-router';

import { DeviceListEmbed } from '@/components/itam/device-list-embed';

export default function DepartmentDevicesTab(): ReactElement {
  const { id = '' } = useParams();
  return (
    <DeviceListEmbed
      filter={{ departmentId: id }}
      // As a location's (2026-10-21): who holds each over since when.
      omit={['assignedAt']}
      show={['noAndName', 'serialNo', 'assignee']}
    />
  );
}
