import { useTranslation } from '@nocobase/i18n/client';
import { Construction } from 'lucide-react';
import type { ReactElement } from 'react';

import { EmptyState } from './empty-state.js';
import { Page, PageHeader } from './page-header.js';

/** Placeholder for a navigation entry whose page arrives in a later phase. */
export function ComingSoon({
  titleKey,
  phase,
}: {
  readonly titleKey: string;
  readonly phase: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Page>
      <PageHeader title={t(titleKey)} />
      <EmptyState
        icon={<Construction />}
        title={t('comingSoon.title')}
        description={t('comingSoon.description', { phase })}
      />
    </Page>
  );
}
