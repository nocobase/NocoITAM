import type { ReactElement } from 'react';
import { useParams } from 'react-router';

import { DeviceListEmbed } from '@/components/itam/device-list-embed';

export default function ModelDevicesTab(): ReactElement {
  const { id = '' } = useParams();
  return <DeviceListEmbed filter={{ modelId: id }} />;
}
