import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { AiShortcut } from '@/components/itam/ai/ai-shortcut';
import { useAiPageContext } from '@/lib/itam/ai-context';
import type { ReportResult } from '@/lib/itam/workbench';

/**
 * "Interpret this report", answered by the ITAM assistant in the chat: the
 * report on screen — its filters, totals and the first rows of each
 * section — goes with the prompt as page context.
 */
export function ReportInsight({
  report,
}: {
  readonly report: ReportResult;
}): ReactElement | null {
  const { t } = useTranslation();
  const {
    ref: contextRef,
    available,
    ask,
  } = useAiPageContext({
    id: `itam-report-${report.name}`,
    title: t(`reports.names.${report.name}`, { defaultValue: report.name }),
    kind: 'report',
    getContext: () => ({
      report: report.name,
      filters: report.filters,
      canSeeCost: report.canSeeCost,
      totals: report.totals,
      sections: report.sections.map((section) => ({
        key: section.key,
        columns: section.columns,
        rows: section.rows.slice(0, 50),
        more: Math.max(0, section.rows.length - 50),
      })),
    }),
  });
  if (!available) return null;
  return (
    <div ref={contextRef}>
      <AiShortcut onClick={() => ask(t('ai.prompts.reportInsight'))}>
        {t('ai.reportInsight')}
      </AiShortcut>
    </div>
  );
}
