import type { ReactElement } from 'react';
import { useParams } from 'react-router';

import { masterDataPath, useItamRecord } from '@/lib/itam/api';

import { OnboardingKitItems } from './master-domain-parts.js';

/** 配置清单: an onboarding kit's items, the first tab of its page. */
export default function Tab(): ReactElement | null {
  const { id = '' } = useParams();
  const kit = useItamRecord(masterDataPath('onboardingKits'), id);
  return kit.data ? <OnboardingKitItems record={kit.data} /> : null;
}
