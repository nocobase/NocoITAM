import type { ReactElement } from 'react';
import { useParams } from 'react-router';

import { AttachmentsTab } from '@/components/itam/attachments-tab';

/** Files on an accessory, consumable or component: manuals, photos, invoices. */
export default function Page(): ReactElement {
  const { id = '' } = useParams();
  return <AttachmentsTab ownerType='stockItems' ownerId={id} />;
}
