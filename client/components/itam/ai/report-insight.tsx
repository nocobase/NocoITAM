import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { AiShortcut } from '@/components/itam/ai/ai-shortcut';
import { useItamAi } from '@/lib/itam/ai-chat';
import type { ReportResult } from '@/lib/itam/workbench';

/**
 * "Interpret this report", answered by the ITAM assistant in the chat: the
 * prompt names the report and the filters on screen, and the assistant runs
 * the same report under the reader's grants (`itam stats --report`).
 */
export function ReportInsight({
  report,
}: {
  readonly report: ReportResult;
}): ReactElement | null {
  const { t } = useTranslation();
  const ai = useItamAi();
  if (!ai.available) return null;
  const filters = Object.fromEntries(
    Object.entries(report.filters).filter(
      ([, value]) => value !== undefined && value !== null && value !== '',
    ),
  );
  return (
    <div>
      <AiShortcut
        onClick={() =>
          ai.ask(
            t('ai.prompts.reportInsight', {
              report: report.name,
              filters: JSON.stringify(filters),
            }),
          )
        }
      >
        {t('ai.reportInsight')}
      </AiShortcut>
    </div>
  );
}
