import type { ReactElement } from 'react';

import { ReceiptAgentCard } from './receipt-agent-card';
import { SettingsModulePage } from '../../settings/settings-module-page.js';

/** 设置 → 按送货单入库: what the assistant may do there, and how it has done. */
export default function ReceiptAgentSettingsPage(): ReactElement {
  return (
    <SettingsModulePage>
      <div className='max-w-4xl'>
        <ReceiptAgentCard />
      </div>
    </SettingsModulePage>
  );
}
