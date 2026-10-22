import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { SegmentedControl } from '@/components/itam/segmented-control';
import {
  setWorkScope,
  useWorkScope,
  type WorkScope,
} from '@/lib/itam/work-scope';

const SCOPES: readonly WorkScope[] = ['all', 'mine'];

/** 全部 · 我的: the team's to-dos, or the reader's part of them. */
export function WorkScopeToggle(): ReactElement {
  const { t } = useTranslation();
  const scope = useWorkScope();
  return (
    <SegmentedControl
      value={scope}
      onChange={setWorkScope}
      label={t('workbench.scope.label')}
      options={SCOPES.map((value) => ({
        value,
        label: t(`workbench.scope.${value}`),
      }))}
    />
  );
}
