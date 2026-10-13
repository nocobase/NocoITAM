import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { AiShortcut } from '@/components/itam/ai/ai-shortcut';
import { useAiPageContext } from '@/lib/itam/ai-chat';

/**
 * "Explain the differences", answered by the ITAM assistant in the chat:
 * the audit goes with the prompt as page context, the assistant reads its
 * counted items (`itam record get auditTasks <id>`), groups the open
 * differences by likely cause and says how to handle each group. Resolving
 * them stays on this tab.
 */
export function AuditGrouping({
  auditId,
  auditName,
  differences,
}: {
  readonly auditId: string;
  readonly auditName: string;
  /** How many differences are still open: the shortcut needs one. */
  readonly differences: number;
}): ReactElement | null {
  const { t } = useTranslation();
  const { available, ask } = useAiPageContext({
    kind: 'auditTasks',
    id: auditId,
    label: auditName,
  });
  if (!available || differences === 0) return null;
  return (
    <div>
      <AiShortcut onClick={() => ask(t('ai.prompts.groupDifferences'))}>
        {t('ai.groupDifferences')}
      </AiShortcut>
    </div>
  );
}
