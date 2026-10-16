import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';

import { ReceiptAgentCard } from './receipt-agent-card';

/** 设置 → 按送货单入库: what the assistant may do there, and how it has done. */
export default function ReceiptAgentSettingsPage(): ReactElement {
  const { t } = useTranslation();
  return (
    <PageContainer>
      <PageHeader title={t('settings.receiptAgent.title')} />
      <div className='max-w-4xl'>
        <ReceiptAgentCard />
      </div>
    </PageContainer>
  );
}
