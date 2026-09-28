import type { ReactElement } from 'react';
import { useParams } from 'react-router';

import { AttachmentsTab } from '@/components/itam/attachments-tab';

export default function Page(): ReactElement {
  const { id = '' } = useParams();
  return <AttachmentsTab ownerType='entitlements' ownerId={id} />;
}
