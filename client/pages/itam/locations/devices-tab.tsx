import type { ReactElement } from 'react';
import { useParams } from 'react-router';

import { DeviceListEmbed } from '@/components/itam/device-list-embed';

export default function LocationDevicesTab(): ReactElement {
  const { id = '' } = useParams();
  return <DeviceListEmbed filter={{ locationId: id }} />;
}
