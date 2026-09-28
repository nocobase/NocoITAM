import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { AiShortcut } from '@/components/itam/ai/ai-shortcut';
import type { ItamRecord } from '@/lib/itam/api';
import { useAiPageContext } from '@/lib/itam/ai-context';
import { text } from '@/lib/itam/format';

/**
 * "Explain the differences", answered by the ITAM assistant in the chat:
 * the audit's open differences go with the prompt as page context, and the
 * assistant groups them by likely cause and says how to handle each group.
 * Resolving them stays on this tab.
 */
export function AuditGrouping({
  items,
}: {
  readonly items: readonly ItamRecord[];
}): ReactElement | null {
  const { t } = useTranslation();
  const {
    ref: contextRef,
    available,
    ask,
  } = useAiPageContext({
    id: 'itam-audit-differences',
    title: t('ai.groupDifferences'),
    kind: 'auditDifferences',
    getContext: () => ({
      differences: items.slice(0, 300).map((item) => ({
        itemId: item.id,
        deviceId: item.deviceId,
        device: text(item.deviceNo) || text(item.label),
        result: item.result,
        bookStatus: item.bookStatus,
        bookLocationId: item.bookLocationId,
        actualLocationId: item.actualLocationId,
        // An assignee is a person, a location or a device; the type says.
        bookAssigneeType: item.bookAssigneeType,
        bookAssigneeId: item.bookAssigneeId,
        actualAssigneeType: item.actualAssigneeType,
        actualAssigneeId: item.actualAssigneeId,
        actualStatus: item.actualStatus,
        notes: item.notes,
      })),
      more: Math.max(0, items.length - 300),
    }),
  });
  if (!available || items.length === 0) return null;
  return (
    <div ref={contextRef}>
      <AiShortcut onClick={() => ask(t('ai.prompts.groupDifferences'))}>
        {t('ai.groupDifferences')}
      </AiShortcut>
    </div>
  );
}
