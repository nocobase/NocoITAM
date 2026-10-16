import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { useParams } from 'react-router';

import { RecordFlow } from '@/components/itam/record-flow';
import { DISPOSALS_PATH } from '@/lib/itam/operations';

/** 流程: where the disposal stands on its lifecycle (2026-10-18). */
export default function Page(): ReactElement {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  return (
    <RecordFlow
      path={DISPOSALS_PATH}
      id={id}
      stateLabel={(state) => t(`enums.disposalStatus.${state}`)}
      transitionLabel={(transition) => t(`disposals.transitions.${transition}`)}
    />
  );
}
